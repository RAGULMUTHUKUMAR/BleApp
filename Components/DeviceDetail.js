import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import { useRoute } from '@react-navigation/native';
import { BleManager } from 'react-native-ble-plx';
import RNFS from 'react-native-fs';
import base64js from 'base64-js';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Button, Card, Title, Paragraph, Snackbar } from 'react-native-paper';

const REBOOT = 0x01;
const READY_TO_RECEIVE = 0x02;
const ERROR_NO_FREE = 0x03;
const CHUNK_LENGTH = 240;
const SECTOR_SIZE = 8 * 1024;
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
        
        // Monitor notifications for status updates
        if (indicateCharacteristic.current) {
          await indicateCharacteristic.current.monitor(notifHandler);
        }

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
          indicateCharacteristic.current.removeAllListeners();
        }
        bleManager.cancelDeviceConnection(deviceId).catch(console.error);
      }
    };
  }, [deviceId]);

  const createBaseAddressData = (actionCode, addressOffset, numSectors) => {
    const offsetBytes = [
      (addressOffset >> 16) & 0xFF,
      (addressOffset >> 8) & 0xFF,
      addressOffset & 0xFF
    ];
    return new Uint8Array([actionCode, ...offsetBytes, numSectors]);
  };

  const writeAddress = async (actionCode, numSectors) => {
    const baseAddress = 0x080000; // Example address
    const baseAddressData = createBaseAddressData(actionCode, baseAddress, numSectors);
    
    try {
      if (writeAddressCharacteristic.current) {
        console.log('Writing address data:', baseAddressData);
        await writeAddressCharacteristic.current.writeWithoutResponse(baseAddressData);
        console.log('Address data written successfully.');
      } else {
        console.error('writeAddressCharacteristic is not initialized');
        setError('writeAddressCharacteristic is not initialized');
      }
    } catch (error) {
      console.error('Error writing address:', error.message);
      setError(`Address write error: ${error.message}`);
    }
  };

  const writeToCharacteristic = async (characteristic, data) => {
    try {
      console.log('Writing data:', new Uint8Array(data));
      await characteristic.writeWithoutResponse(data);
      console.log('Data written successfully.');
    } catch (error) {
      console.error('Error writing data:', error.message);
      setError(`Data write error: ${error.message}`);
    }
  };

  const sliceAndSend = async () => {
    if (readyToReceive && fileContent) {
      let start = 0;
      let totalBytes = 0;

      while (start < fileLength) {
        const end = Math.min(start + CHUNK_LENGTH, fileLength);
        const sub = fileContent.data.slice(start, end);
        start = end;
        await writeToCharacteristic(writeWithoutResponseCharacteristic.current, sub);
        totalBytes += sub.byteLength;
        const progress = (totalBytes * 100) / fileLength;
        setProgress(progress);
      }

      const fileUploadFinished = new Uint8Array([0x07]);
      await writeToCharacteristic(writeAddressCharacteristic.current, fileUploadFinished.buffer);
      console.log('File upload finished.');
      setIsUploading(false);
    } else {
      console.log('Not ready to receive or no file content.');
    }
  };

  const notifHandler = (characteristic) => {
    const buf = new Uint8Array(characteristic.value.buffer);
    if (buf[0] === REBOOT) {
      Alert.alert('Programming...', 'Please wait');
    } else if (buf[0] === READY_TO_RECEIVE) {
      setReadyToReceive(true);
      sliceAndSend();
    } else if (buf[0] === ERROR_NO_FREE) {
      console.log('Error no Free');
      setError('Error: Device cannot accept new firmware.');
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
      await writeAddress(0x01, Math.ceil(fileLength / SECTOR_SIZE)); // START User Data Upload
      sliceAndSend();
    }
  };

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Title>Firmware Upload</Title>
          <Paragraph>Select and upload firmware files to your device.</Paragraph>
        </Card.Content>
        <Card.Actions>
          <TouchableOpacity onPress={handleFileSelection} style={styles.button}>
            <Icon name="file-upload" size={24} color="#fff" />
            <Text style={styles.buttonText}>Select Firmware File</Text>
          </TouchableOpacity>
        </Card.Actions>
      </Card>
      {fileContent && (
        <Card style={styles.infoCard}>
          <Card.Content>
            <Title>Selected File</Title>
            <Paragraph>{fileContent.uri}</Paragraph>
            <Paragraph>File Size: {fileLength} bytes</Paragraph>
          </Card.Content>
        </Card>
      )}
      <Button
        mode="contained"
        icon="upload"
        onPress={handleUpload}
        disabled={isUploadButtonDisabled || isUploading}
        style={styles.uploadButton}
      >
        {isUploading ? 'Uploading...' : 'Upload Firmware'}
      </Button>
      {isUploading && (
        <ActivityIndicator size="large" color="#007bff" style={styles.loadingIndicator} />
      )}
      {statusMessage && <Text style={styles.statusMessage}>{statusMessage}</Text>}
      {error && (
        <Snackbar
          visible={!!error}
          onDismiss={() => setError('')}
          duration={Snackbar.DURATION_LONG}
          action={{
            label: 'Dismiss',
            onPress: () => setError(''),
          }}
        >
          {error}
        </Snackbar>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  card: {
    marginBottom: 16,
  },
  infoCard: {
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#007bff',
    padding: 16,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
  uploadButton: {
    marginBottom: 16,
  },
  loadingIndicator: {
    marginVertical: 16,
  },
  statusMessage: {
    marginVertical: 16,
    fontSize: 16,
    color: '#007bff',
  },
});

export default DeviceDetails;
