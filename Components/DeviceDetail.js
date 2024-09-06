import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ProgressBarAndroid, Switch } from 'react-native';
import RNFS from 'react-native-fs';
import DocumentPicker from 'react-native-document-picker';
import { Buffer } from 'buffer';
import { useBluetoothCharacteristics } from './BluetoothCharacteristics';

const REBOOT = 1;
const READY_TO_RECEIVE = 2;
const ERROR_NO_FREE = 3;
const CHUNK_LENGTH = 240;
const SECTOR_SIZE = 8 * 1024;
const BASE_ADDRESS = 0x080000;

const DeviceDetails = ({ route }) => {
  const { deviceId } = route.params;
  const [fileContent, setFileContent] = useState(null);
  const [fileLength, setFileLength] = useState(0);
  const [nbSector, setNbSector] = useState(0);
  const [readyToReceive, setReadyToReceive] = useState(false);
  const [uploadAction, setUploadAction] = useState(null);
  const [manualySettingNbSector, setManualySettingNbSector] = useState(false);
  const [progress, setProgress] = useState(0);
  const [startSector, setStartSector] = useState('');
  const [sectorCount, setSectorCount] = useState('23');

  const { writeAddressCharacteristic, indicateCharacteristic, writeWithoutResponseCharacteristic } = useBluetoothCharacteristics(deviceId);

  useEffect(() => {
    if (indicateCharacteristic) {
      indicateCharacteristic.monitor((error, characteristic) => {
        if (error) {
          console.error('Indication Error: ', error);
          return;
        }
        notifHandler(characteristic);
      });
    }
  }, [indicateCharacteristic]);

  const notifHandler = (characteristic) => {
    const buf = new Uint8Array(characteristic.value);
    console.log(buf);
    if (buf[0] === REBOOT) {
      Alert.alert('Programming... Please wait');
    } else if (buf[0] === READY_TO_RECEIVE) {
      setReadyToReceive(true);
      sliceAndSend();
    } else if (buf[0] === ERROR_NO_FREE) {
      Alert.alert('Error no Free');
    }
  };

  const addressToByteArray = (address) => {
    const bytes = new Uint8Array(4);
    bytes[0] = (address >> 24) & 0xFF;
    bytes[1] = (address >> 16) & 0xFF;
    bytes[2] = (address >> 8) & 0xFF;
    bytes[3] = address & 0xFF;
    return bytes;
  };

  const writeAddress = async () => {
    if (!uploadAction || !startSector) return;

    const baseAddressBytes = addressToByteArray(BASE_ADDRESS);
    const startSectorInt = parseInt(startSector, 16);
    const startSectorBytes = addressToByteArray(startSectorInt);

    const myWord = new Uint8Array(5);
    myWord[0] = uploadAction;
    myWord.set(baseAddressBytes, 1);
    myWord[4] = nbSector;

    try {
      await writeAddressCharacteristic.writeWithResponse(myWord);
      console.log('Writing >> ' + myWord);
    } catch (error) {
      console.error('Error writing address:', error);
    }
  };

  const sliceAndSend = async () => {
    if (!fileContent) return;

    let start = 0;
    let end = CHUNK_LENGTH;
    let totalBytes = 0;

    if (readyToReceive) {
      for (let i = 0; i < fileLength / CHUNK_LENGTH; i++) {
        let sub = fileContent.slice(start, end);
        start = end;
        end += CHUNK_LENGTH;
        try {
          await writeWithoutResponseCharacteristic.writeWithoutResponse(sub);
          totalBytes += sub.byteLength;
          setProgress((totalBytes * 100) / fileLength);
        } catch (error) {
          console.error('Error writing chunk:', error);
        }
      }

      let FileUploadFinished = new Uint8Array(1);
      FileUploadFinished[0] = 0x07;
      await writeAddressCharacteristic.writeWithResponse(FileUploadFinished);
      console.log(FileUploadFinished);
    } else {
      Alert.alert('Not ready to receive...');
    }
  };

  const handleFileChange = async () => {
    try {
      const res = await DocumentPicker.pick({
        type: ['application/octet-stream'],
      });
      const file = res[0];
      const fileUri = file.uri;
  
      console.log('Selected File: ', res);

      console.log('Fetching file from URI:', fileUri);
  
      // Read file content
      const fileContentBase64 = await RNFS.readFile(fileUri, 'base64');
      // console.log('fileContentBase64: ', fileContentBase64);
  
      // Convert base64 to Buffer
      const buffer = Buffer.from(fileContentBase64, 'base64');
      // console.log('buffer: ', buffer);
  
      // Convert Buffer to Uint8Array
      const uint8View = new Uint8Array(buffer);
      // console.log('uint8View: ', uint8View);
  
      console.log('File content length:', uint8View.length);
      Alert.alert('File loaded successfully');
    } catch (err) {
      if (DocumentPicker.isCancel(err)) {
        console.log('Canceled from document picker');
      } else {
        console.error('Error while picking or processing file:', err);
        Alert.alert('Error', 'Failed to load file');
      }
    }
  };

  const calculateNbSector = (length) => {
    let sectors = Math.ceil(length / SECTOR_SIZE);
    setNbSector(sectors);
    setSectorCount(sectors.toString());
  };

  const handleUploadButtonClick = () => {
    if (!manualySettingNbSector) {
      calculateNbSector(fileLength);
    } else {
      setNbSector(parseInt(sectorCount, 10));
    }
    writeAddress();
    sliceAndSend();
  };

  return (
    <View style={styles.container}>
      <Text>Choose Action:</Text>
      <View style={styles.radioGroup}>
        <Text>User Configuration Data Update</Text>
        <Switch
          value={uploadAction === 1}
          onValueChange={() => setUploadAction(1)}
        />
        <Text>Application Update</Text>
        <Switch
          value={uploadAction === 2}
          onValueChange={() => setUploadAction(2)}
        />
      </View>
      <Button onPress={handleFileChange} title="Choose Firmware File"/>
      <TextInput
        style={styles.input}
        placeholder="Start Sector Address"
        value={startSector}
        onChangeText={setStartSector}
      />
      <View style={styles.checkboxContainer}>
        <Text>Set number of sectors manually:</Text>
        <Switch
          value={manualySettingNbSector}
          onValueChange={setManualySettingNbSector}
        />
      </View>
      {manualySettingNbSector && (
        <TextInput
          style={styles.input}
          placeholder="Number of Sectors"
          value={sectorCount}
          onChangeText={setSectorCount}
        />
      )}
      <Button title="Upload" onPress={handleUploadButtonClick} />
      <ProgressBarAndroid styleAttr="Horizontal" indeterminate={false} progress={progress / 100} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cccccc',
    padding: 8,
    marginBottom: 16,
  },
  radioGroup: {
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
});

export default DeviceDetails;
