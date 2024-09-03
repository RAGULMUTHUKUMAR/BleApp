import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import { useRoute } from '@react-navigation/native';
import { BleManager } from 'react-native-ble-plx';
import RNFS from 'react-native-fs';
import base64js from 'base64-js';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Button, Card, Title, Paragraph, Snackbar } from 'react-native-paper';
import * as Animatable from 'react-native-animatable';

const REBOOT = 1;
const READY_TO_RECEIVE = 2;
const ERROR_NO_FREE = 3;
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
  
  const writeToCharacteristic = async (characteristic, data) => {
    try {
      console.log('Writing data:', data);
      await characteristic.writeWithoutResponse(data);
      console.log('Write successful');
    } catch (error) {
      console.error('Error writing data:', error);
      setError(`Error writing data: ${error.message}`);
    }
  };
  

  const writeAddress = async (uploadAction, nbSector) => {
    const baseAddress = 0x080000;
    const hexString = baseAddress.toString(16).padStart(6, '0');
    let hexStringFirstPart = hexString.substring(0, 2);
    let hexStringSecondPart = hexString.substring(2, 4);
    let hexStringThirdPart = hexString.substring(4, 6);
    hexStringFirstPart = parseInt(hexStringFirstPart, 16);
    hexStringSecondPart = parseInt(hexStringSecondPart, 16);
    hexStringThirdPart = parseInt(hexStringThirdPart, 16);
    const nbSectorHex = nbSector.toString(16);

    let myWord = new Uint8Array(5);
    myWord[0] = parseInt(uploadAction, 16);
    myWord[1] = hexStringFirstPart;
    myWord[2] = hexStringSecondPart;
    myWord[3] = hexStringThirdPart;
    myWord[4] = parseInt(nbSectorHex, 16);

    try {
        if (writeAddressCharacteristic.current) {
            await writeAddressCharacteristic.current.writeWithoutResponse(myWord);
            console.log("Writing >> " + myWord);
        } else {
            console.error('writeAddressCharacteristic is not initialized');
        }
    } catch (error) {
        console.log('Error: ' + error);
    }
};


  const sliceAndSend = async () => {
    if (readyToReceive && fileContent) {
      let start = 0;
      let end = CHUNK_LENGTH;
      let totalBytes = 0;

      while (start < fileLength) {
        const sub = fileContent.data.slice(start, end);
        start = end;
        end = start + CHUNK_LENGTH;
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
      {error ? (
        <Snackbar
          visible={!!error}
          onDismiss={() => setError('')}
          duration={Snackbar.DURATION_LONG}
          style={styles.snackbar}
        >
          {error}
        </Snackbar>
      ) : null}
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
    backgroundColor: '#f0f0f0',
    padding: 16,
  },
  card: {
    width: '90%',
    marginBottom: 20,
    elevation: 3,
  },
  infoCard: {
    width: '90%',
    marginBottom: 20,
    elevation: 3,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007bff',
    padding: 10,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 10,
  },
  uploadButton: {
    width: '80%',
    marginTop: 20,
  },
  loadingIndicator: {
    marginTop: 20,
  },
  snackbar: {
    backgroundColor: 'red',
  },
  statusText: {
    fontSize: 18,
    color: '#007bff',
    margin: 10,
  },
  progressText: {
    fontSize: 16,
    color: '#28a745',
    marginTop: 10,
  },
});

export default DeviceDetails;
