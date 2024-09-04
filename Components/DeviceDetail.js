import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  ProgressBarAndroid,
  Alert,
  Platform,
  StyleSheet,
  TouchableOpacity,
  PermissionsAndroid,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import { BleManager } from "react-native-ble-plx";
import DocumentPicker from "react-native-document-picker";
import CheckBox from "@react-native-community/checkbox";
import RNFS from "react-native-fs";

const bleManager = new BleManager();

const REBOOT = 1;
const READY_TO_RECEIVE = 2;
const ERROR_NO_FREE = 3;
const CHUNK_LENGTH = 240;
const SECTOR_SIZE = 8 * 1024;

const OTA_SERVICE_UUID = "0000FE20-8e22-4541-9d4c-21edae82ed19";
const BASE_ADDRESS_UUID = "0000FE22-8e22-4541-9d4c-21edae82ed19";
const CONFIRMATION_UUID = "0000FE23-8e22-4541-9d4c-21edae82ed19";
const RAW_DATA_UUID = "0000FE24-8e22-4541-9d4c-21edae82ed19";

const DeviceDetails = () => {
  const route = useRoute();
  const { deviceId } = route.params;
  const [device, setDevice] = useState(null);
  const [writeAddressCharacteristic, setWriteAddressCharacteristic] = useState(null);
  const [indicateCharacteristic, setIndicateCharacteristic] = useState(null);
  const [writeWithoutResponseCharacteristic, setWriteWithoutResponseCharacteristic] = useState(null);
  const [progress, setProgress] = useState(0);
  const [fileContent, setFileContent] = useState(null);
  const [fileLength, setFileLength] = useState(0);
  const [startSectorInput, setStartSectorInput] = useState("080000");
  const [nbSectorInput, setNbSectorInput] = useState("");
  const [selectedAction, setSelectedAction] = useState(null);
  const [uploadAction, setUploadAction] = useState(0);
  const [manuallySettingNbSector, setManuallySettingNbSector] = useState(false);
  const [isFileSelected, setIsFileSelected] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [readyToReceive, setReadyToReceive] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const requestPermissions = async () => {
      if (Platform.OS === 'android') {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
            {
              title: 'Permission to read storage',
              message: 'We need access to your storage to select firmware files.',
              buttonNeutral: 'Ask Me Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'OK',
            }
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            Alert.alert('Permission Denied', 'You need to grant storage permission to select firmware files.');
            return false;
          }
          return true;
        } catch (err) {
          console.error('Permission request error:', err);
          return false;
        }
      }
      return true;
    };

    const connectToDevice = async () => {
      try {
        console.log("Connecting to device...");
        const connectedDevice = await bleManager.connectToDevice(deviceId);
        await connectedDevice.discoverAllServicesAndCharacteristics();
    
        // Wait for a moment to allow services and characteristics to be discovered
        setTimeout(async () => {
          const services = await connectedDevice.services();
          console.log("Services found:", services.map(service => service.uuid));
    
          // Iterate through all services and log their characteristics
          for (const service of services) {
            console.log(`Service UUID: ${service.uuid}`);
            const characteristics = await service.characteristics();
            console.log(`Characteristics for Service ${service.uuid}:`, characteristics.map(char => char.uuid));
    
            // Check if the service is the OTA service
            if (service.uuid === OTA_SERVICE_UUID) {
              console.log("OTA Service found.");
              const baseAddressChar = characteristics.find((char) => char.uuid === BASE_ADDRESS_UUID);
              const confirmChar = characteristics.find((char) => char.uuid === CONFIRMATION_UUID);
              const rawDataChar = characteristics.find((char) => char.uuid === RAW_DATA_UUID);
    
              if (baseAddressChar) {
                console.log("Base Address Characteristic found.");
                setWriteAddressCharacteristic(baseAddressChar);
              } else {
                console.error("Base Address Characteristic not found.");
              }
    
              if (confirmChar) {
                console.log("Confirmation Characteristic found.");
                setIndicateCharacteristic(confirmChar);
                // Set up notifications for the confirmation characteristic
                await confirmChar.startNotifications();
                confirmChar.onValueChange(handleNotification);
              } else {
                console.error("Confirmation Characteristic not found.");
              }
    
              if (rawDataChar) {
                console.log("Raw Data Characteristic found.");
                setWriteWithoutResponseCharacteristic(rawDataChar);
              } else {
                console.error("Raw Data Characteristic not found.");
              }
            }
          }
    
          if (!writeAddressCharacteristic || !indicateCharacteristic || !writeWithoutResponseCharacteristic) {
            throw new Error("One or more OTA characteristics not found");
          }
    
          setDevice(connectedDevice);
          console.log("Device connected and characteristics set.");
        }, 2000); // Adjust timeout if necessary
      } catch (err) {
        console.error("Connection Error:", err.message);
        Alert.alert("Error", err.message);
        setError(err.message);
      }
    };
    

    requestPermissions().then(() => {
      connectToDevice();
    });

    return () => {
      if (device) {
        device.cancelConnection();
      }
    };
  }, [deviceId]);

  const handleNotification = (event) => {
    const buf = new Uint8Array(event.value);
    console.log("Notification received:", buf);
    if (buf[0] === REBOOT) {
      Alert.alert("Programming...", "Please wait.");
    } else if (buf[0] === READY_TO_RECEIVE) {
      setReadyToReceive(true);
      sliceAndSend();
    } else if (buf[0] === ERROR_NO_FREE) {
      Alert.alert("Error", "No free space.");
    }
  };

  const writeAddress = async () => {
    if (!writeAddressCharacteristic) {
      Alert.alert("Error", "Write Address Characteristic is not set.");
      console.error("Write Address Characteristic is not set.");
      return;
    }

    const address = startSectorInput;
    const myWord = new Uint8Array(5);
    myWord[0] = uploadAction;
    myWord[1] = parseInt(address.substring(0, 2), 16);
    myWord[2] = parseInt(address.substring(2, 4), 16);
    myWord[3] = parseInt(address.substring(4, 6), 16);
    myWord[4] = parseInt(nbSectorInput, 10);

    try {
      console.log("Writing address:", myWord);
      await writeAddressCharacteristic.writeValue(myWord);
      console.log("Address written successfully.");
    } catch (error) {
      console.error("Write Address Error:", error.message);
      setError("Error: " + error.message);
    }
  };

  const sliceAndSend = async () => {
    if (readyToReceive) {
      let start = 0;
      let end = CHUNK_LENGTH;
      let totalBytes = 0;

      for (let i = 0; i < Math.ceil(fileLength / CHUNK_LENGTH); i++) {
        let sub = fileContent.slice(start, end);
        start = end;
        end += CHUNK_LENGTH;
        try {
          console.log("Sending chunk:", sub);
          await writeWithoutResponseCharacteristic.writeValue(sub);
          totalBytes += sub.byteLength;
          setProgress((totalBytes * 100) / fileLength);
        } catch (error) {
          console.error("Send Chunk Error:", error.message);
          setError("Error: " + error.message);
          break;
        }
      }

      const fileUploadFinished = new Uint8Array(1);
      fileUploadFinished[0] = 7;
      try {
        console.log("Ending file upload.");
        await writeAddressCharacteristic.writeValue(fileUploadFinished);
        setUploading(false);
        Alert.alert("Programming...", "Please wait.");
      } catch (error) {
        console.error("End File Upload Error:", error.message);
        setError("Error: " + error.message);
      }
    }
  };
  const base64ToUint8Array = (base64) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };
  
  const selectFile = async () => {
    try {
      const res = await DocumentPicker.pick({
        type: [DocumentPicker.types.allFiles],
      });
  
      if (res && res[0]) {
        const fileUri = res[0].uri;
        console.log("File URI:", fileUri);
  
        if (Platform.OS === "android") {
          // Use RNFS to read the file content using the URI
          const fileContent = await RNFS.readFile(fileUri, "base64");
  
          // Convert base64 string to Uint8Array
          const uint8View = base64ToUint8Array(fileContent);
  
          setFileContent(uint8View);
          setFileLength(res[0].size);
          setIsFileSelected(true);
        } else {
          // For iOS, use fetch to read file content
          const response = await fetch(fileUri);
          if (!response.ok) {
            throw new Error("Network response was not ok.");
          }
          const arrayBuffer = await response.arrayBuffer();
          const uint8View = new Uint8Array(arrayBuffer);
  
          setFileContent(uint8View);
          setFileLength(res[0].size);
          setIsFileSelected(true);
        }
      }
    } catch (error) {
      console.error("File Selection Error:", error.message);
      setError("File Selection Error: " + error.message);
    }
  };
  
  const handleActionChange = (action) => {
    setUploadAction(action);
    setSelectedAction(action);
  };

  return (
    <View style={styles.container}>
      {error && <Text style={styles.errorText}>{error}</Text>}
      <Text>Device ID: {deviceId}</Text>
      <Text>Selected File: {isFileSelected ? "Yes" : "No"}</Text>
      <TouchableOpacity onPress={selectFile} style={styles.button}>
        <Text style={styles.buttonText}>Select Firmware File</Text>
      </TouchableOpacity>
      <View style={styles.inputContainer}>
        <Text>Start Sector (Hex):</Text>
        <TextInput
          style={styles.input}
          onChangeText={(text) => setStartSectorInput(text)}
          value={startSectorInput}
        />
      </View>
      <View style={styles.inputContainer}>
        <Text>Number of Sectors:</Text>
        <TextInput
          style={styles.input}
          onChangeText={(text) => setNbSectorInput(text)}
          value={nbSectorInput}
        />
        <CheckBox
          value={manuallySettingNbSector}
          onValueChange={() => setManuallySettingNbSector(!manuallySettingNbSector)}
        />
        <Text>Manually Set Sector</Text>
      </View>
      <View style={styles.buttonContainer}>
        <Button
          title="Start Firmware Upload"
          onPress={async () => {
            if (fileContent && nbSectorInput) {
              setUploading(true);
              await writeAddress();
            } else {
              Alert.alert("Error", "Please select a file and enter the number of sectors.");
            }
          }}
        />
      </View>
      {uploading && (
        <View style={styles.progressContainer}>
          <Text>Uploading: {Math.round(progress)}%</Text>
          <ProgressBarAndroid styleAttr="Horizontal" color="#2196F3" indeterminate={false} progress={progress / 100} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  button: {
    backgroundColor: "#2196F3",
    padding: 10,
    marginVertical: 10,
  },
  buttonText: {
    color: "#fff",
    textAlign: "center",
  },
  inputContainer: {
    marginVertical: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    marginVertical: 5,
  },
  buttonContainer: {
    marginVertical: 10,
  },
  progressContainer: {
    marginVertical: 10,
  },
  errorText: {
    color: "red",
  },
});

export default DeviceDetails;
