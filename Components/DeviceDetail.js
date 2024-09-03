import React, { useState, useEffect, useRef } from 'react';
import { Button, View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import { useRoute } from '@react-navigation/native';
import { BleManager } from 'react-native-ble-plx';
import RNFS from 'react-native-fs';
import base64js from 'base64-js';
import Buffer from 'buffer'; // Ensure you import Buffer if using it

const CHUNK_LENGTH = 240;
const bleManager = new BleManager();

const DeviceDetails = () => {
  const { params } = useRoute();
  const deviceId = params.deviceId;

  const [isUploadButtonDisabled, setIsUploadButtonDisabled] = useState(true);
  const [progress, setProgress] = useState(0);
  const [fileContent, setFileContent] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [readyToReceive, setReadyToReceive] = useState(false);
  const [fileLength, setFileLength] = useState(0);

  const writeAddressCharacteristic = useRef(null);
  const indicateCharacteristic = useRef(null);
  const writeWithoutResponseCharacteristic = useRef(null);
  const [device, setDevice] = useState(null);
  const isMounted = useRef(true);

  useEffect(() => {
    const connectToDevice = async () => {
      try {
        setStatusMessage('Connecting to device...');
        const connectedDevice = await bleManager.connectToDevice(deviceId);
        await connectedDevice.discoverAllServicesAndCharacteristics();

        // Adding a delay to ensure proper initialization
        await new Promise(resolve => setTimeout(resolve, 500));

        const services = await connectedDevice.services();
        const otaService = services.find(service => service.uuid === '0000fe20-cc7a-482a-984a-7f2ed5b3e58f');
        if (!otaService) throw new Error('OTA service not found');

        const characteristics = await otaService.characteristics();
        writeAddressCharacteristic.current = characteristics.find(char => char.uuid === '0000fe22-8e22-4541-9d4c-21edae82ed19');
        indicateCharacteristic.current = characteristics.find(char => char.uuid === '0000fe23-8e22-4541-9d4c-21edae82ed19');
        writeWithoutResponseCharacteristic.current = characteristics.find(char => char.uuid === '0000fe24-8e22-4541-9d4c-21edae82ed19');

        if (!writeAddressCharacteristic.current || !indicateCharacteristic.current || !writeWithoutResponseCharacteristic.current) {
          throw new Error('Required characteristics not found');
        }

        await enableIndication();

        setDevice(connectedDevice);
        setStatusMessage('Connected and ready for firmware upload');
        setIsUploadButtonDisabled(false);
      } catch (error) {
        if (isMounted.current) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          setError(`Connection error: ${errorMessage}`);
          setStatusMessage('');
        }
      }
    };

    connectToDevice();

    return () => {
      isMounted.current = false;
      if (device) {
        if (indicateCharacteristic.current) {
          indicateCharacteristic.current.removeAllListeners(); // Ensure this is correct
        }
        bleManager.cancelDeviceConnection(deviceId).catch(console.error);
      }
    };
  }, [deviceId]);

  const enableIndication = async () => {
    try {
      if (indicateCharacteristic.current) {
        // Subscribe to notifications
        await indicateCharacteristic.current.monitor((error, characteristic) => {
          if (error) {
            console.error('Error in monitoring:', error.message);
            return;
          }
          notifHandler(characteristic);
        });
        console.log('Monitoring started successfully');
      } else {
        console.error('Indicate characteristic not found.');
      }
    } catch (error) {
      console.error('Error enabling indications:', error.message);
    }
  };

  const writeToCharacteristic = async (data) => {
    try {
      await writeWithoutResponseCharacteristic.current.writeWithoutResponse(data);
    } catch (error) {
      setError(`Error writing data: ${error.message}`);
    }
  };

  const writeAddress = async (action, nbSector) => {
    try {
      const address = '080000';
      const addressBytes = address.match(/.{1,2}/g).map(h => parseInt(h, 16));
      const nbSectorByte = new Uint8Array([nbSector]);
  
      const dataToWrite = new Uint8Array([action, ...addressBytes, ...nbSectorByte]);
  
      console.log('Data to write:', dataToWrite);
  
      // Write to the characteristic
      await writeAddressCharacteristic.current.writeWithoutResponse(dataToWrite.buffer);
      console.log('Write operation successful for action:', action);
    } catch (error) {
      setError(`Error writing address: ${error.message}`);
      console.error('Write address operation failed:', error.message);
    }
  };
  

  const sliceAndSend = async () => {
    if (readyToReceive && fileContent && writeWithoutResponseCharacteristic.current) {
      const chunkSize = CHUNK_LENGTH; // Adjust based on your BLE device’s characteristic value length
      let start = 0;

      // Ensure progress is reset
      setProgress(0);

      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      try {
        // Read the firmware file in base64 format
        const firmwarePath = fileContent.uri.replace('file://', '');
        const firmwareData = await RNFS.readFile(firmwarePath, 'base64');

        // Send data in chunks
        while (start < firmwareData.length) {
          const chunk = firmwareData.slice(start, start + chunkSize);
          const chunkBuffer = Buffer.from(chunk, 'base64'); // Convert base64 chunk to Buffer

          console.log('Sending chunk:', chunkBuffer); // Debugging line
          await writeWithoutResponseCharacteristic.current.writeWithoutResponse(chunkBuffer);

          // Update progress
          const totalBytes = Math.min(start + chunkSize, firmwareData.length);
          setProgress((totalBytes * 100) / firmwareData.length);

          // Delay between chunks
          await delay(100); // Adjust delay as needed

          start += chunkSize;
        }

        // Finalize the upload
        const fileUploadFinished = new Uint8Array([0x07]); // 0x07 indicates upload finish
        await writeWithoutResponseCharacteristic.current.writeWithoutResponse(fileUploadFinished);

        // Notify user of completion
        Alert.alert('Upload Complete', 'Firmware upload is complete.');

      } catch (error) {
        setError(`Error during upload: ${error.message}`);
        console.error('Error during upload:', error.message);
      }
    } else {
      console.warn('Not ready to receive or file content is missing.');
    }
  };

  const notifHandler = (characteristic) => {
    if (characteristic && characteristic.value) {
      const buffer = base64js.toByteArray(characteristic.value);
      console.log('Received raw buffer:', buffer);
      const buf = new Uint8Array(buffer);
      console.log('Processed buffer:', buf);

      switch (buf[0]) {
        case 1:
          // Reboot Required
          Alert.alert('Reboot Required', 'Programming... Please wait');
          break;
        case 2:
          // Ready to Receive
          setReadyToReceive(true);
          sliceAndSend();
          break;
        case 3:
          // Error: No space available
          Alert.alert('Error', 'No space available on the device. Please free up space and try again.');
          setReadyToReceive(false); // Stop further operations
          break;
        default:
          console.warn('Unhandled notification code:', buf[0]);
          break;
      }
    } else {
      console.error('Notification event is null or does not contain a value:', characteristic);
    }
  };

  const handleFileSelection = async () => {
    try {
      const res = await DocumentPicker.pick({
        type: [DocumentPicker.types.allFiles],
      });
      const file = res[0];
      const fileUri = file.uri;
      const base64String = await RNFS.readFile(fileUri, 'base64');
      const uint8Array = new Uint8Array(base64js.toByteArray(base64String));
      setFileContent({ uri: fileUri, data: uint8Array });
      setFileLength(uint8Array.length);
      setIsUploadButtonDisabled(false);
    } catch (err) {
      if (DocumentPicker.isCancel(err)) {
        console.log('User cancelled the file picker');
      } else {
        setError(`Error selecting file: ${err.message}`);
        console.error('Error selecting file:', err.message);
      }
    }
  };

  const handleUpload = async () => {
    if (fileContent) {
      setIsUploading(true);
      setStatusMessage('Preparing to upload...');
      await writeAddress(1, 24); // Update to use 24 sectors
      setIsUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Button title="Select Firmware File" onPress={handleFileSelection} />
      {fileContent && (
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>Selected File: {fileContent.uri}</Text>
          <Text style={styles.infoText}>File Size: {fileLength} bytes</Text>
        </View>
      )}
      <Button
        title="Upload Firmware"
        onPress={handleUpload}
        disabled={isUploadButtonDisabled || isUploading}
      />
      {isUploading && <ActivityIndicator size="large" color="#0000ff" />}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
      <Text style={styles.progressText}>Upload Progress: {progress.toFixed(2)}%</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    margin: 10,
  },
  infoText: {
    fontSize: 16,
    color: '#333',
  },
  errorText: {
    fontSize: 16,
    color: 'red',
  },
  statusText: {
    fontSize: 16,
    color: 'blue',
  },
  progressText: {
    fontSize: 16,
    color: 'green',
  },
});

export default DeviceDetails;
