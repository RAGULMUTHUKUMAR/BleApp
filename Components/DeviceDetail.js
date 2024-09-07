import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
  ProgressBarAndroid,
  Switch,
} from "react-native";
import RNFS from "react-native-fs";
import DocumentPicker from "react-native-document-picker";
import { Buffer } from "buffer";
import { useBluetoothCharacteristics } from "./BluetoothCharacteristics";

const CHUNK_LENGTH = 240;
const SECTOR_SIZE = 8 * 1024;
const BASE_ADDRESS = 0x080000;

const DeviceDetails = ({ route }) => {
  const { deviceId } = route.params;
  const [fileContent, setFileContent] = useState(null);
  const [fileLength, setFileLength] = useState(0);
  const [nbSector, setNbSector] = useState(0);
  const [progress, setProgress] = useState(0);
  const [startSector, setStartSector] = useState("");
  const [sectorCount, setSectorCount] = useState("23");
  const [readyToReceive, setReadyToReceive] = useState(false);
  const [manualySettingNbSector, setManualySettingNbSector] = useState(false);

  const {
    writeAddressCharacteristic,
    writeWithoutResponseCharacteristic,
    indicateCharacteristic,
  } = useBluetoothCharacteristics(deviceId);

  useEffect(() => {
    if (indicateCharacteristic) {
      const monitorConfirmation = () => {
        try {
          indicateCharacteristic.monitor((error, characteristic) => {
            if (error) {
              console.error("Error monitoring confirmation:", error.message);
              return;
            }

            if (characteristic?.value) {
              const confirmationValue = Buffer.from(
                characteristic.value,
                "base64"
              );
              const indication = confirmationValue.readUInt8(0);

              if (indication === 0x02) {
                setReadyToReceive(true);
                sliceAndSend();
                console.log("Device ready to receive file.");
              } else if (indication === 0x01) {
                console.log("Rebooting...");
              } else if (indication === 0x03) {
                console.log("Error: Device not free to upload.");
              }
            } else {
              console.log("No value received from characteristic");
            }
          });
        } catch (error) {
          console.error("Error starting monitor:", error.message);
        }
      };

      monitorConfirmation();
    }
  }, [indicateCharacteristic]);

  const writeBaseAddress = async (action, addressOffset, sectorsToErase) => {
    if (!writeAddressCharacteristic) {
      console.error("Write address characteristic is not available.");
      return;
    }

    const baseAddressData = Buffer.alloc(5);
    // baseAddressData.writeUInt8(action, 0);
    // baseAddressData.writeUInt32BE(addressOffset, 1);
    // baseAddressData.writeUInt8(sectorsToErase, 5);
    baseAddressData[0] = 0x02;
    baseAddressData[1] = 0x08;
    baseAddressData[2] = 0x00;
    baseAddressData[3] = 0x00;
    baseAddressData[4] = 0x24;

    console.log("baseAddressData", baseAddressData);

    try {
      await writeAddressCharacteristic.writeWithoutResponse(
        baseAddressData.toString("base64")
      );
      //console.log('Base address written:', action);
    } catch (error) {
      console.error("Error writing to base address:", error.message);
      Alert.alert("Error", `Failed to write base address: ${error.message}`);
    }
  };

  const writeRawData = async (dataChunk) => {
    if (!writeWithoutResponseCharacteristic) {
      console.error("Write without response characteristic is not available.");
      return;
    }

    try {
      await writeWithoutResponseCharacteristic.writeWithoutResponse(
        Buffer.from(dataChunk).toString("base64")
      );
      console.log("Raw data written:", dataChunk);
    } catch (error) {
      console.error("Error writing raw data:", error.message);
      Alert.alert("Error", `Failed to write raw data: ${error.message}`);
    }
  };

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // const sliceAndSend = async () => {

  //   console.log('sliceAndSend');

  //       await delay(100);

  //       console.log('After Delay sliceAndSend');

  // };

  const sliceAndSend = async () => {
    console.log("sliceAndSend");
    if (!fileContent) return;
    let start = 0;
    let end = CHUNK_LENGTH;
    let totalBytes = 0;

    try {
      for (let i = 0; i < fileLength; i += CHUNK_LENGTH) {
        // const chunk = fileContent.slice(start, end);
        // start = end;
        // end = start + CHUNK_LENGTH;

        // const chunkLength = Math.min(CHUNK_LENGTH, fileLength - i);
        // const chunkToSend = chunk.slice(0, chunkLength);

        // await writeRawData(chunkToSend);

        console.log("sliceAndSend", i);
        // Adding a delay of 100ms
        // await delay(100);
        // totalBytes += chunkToSend.byteLength;
        // setProgress((totalBytes * 100) / fileLength);
      }

      let fileUploadFinished = new Uint8Array(1);
      fileUploadFinished[0] = 0x07; // File upload finish command
      const fileUploadFinishedBuffer = Buffer.from(fileUploadFinished);
      await writeAddressCharacteristic.characteristic.writeValue(
        fileUploadFinished
      );
    } catch (error) {
      console.error("Error during slice and send:", error.message);
      Alert.alert("Error", `Failed to send file: ${error.message}`);
    }
  };

  const handleFileChange = async () => {
    try {
      const res = await DocumentPicker.pick({
        type: ["application/octet-stream"],
      });
      const file = res[0];
      const fileUri = file.uri;

      const fileContentBase64 = await RNFS.readFile(fileUri, "base64");
      const buffer = Buffer.from(fileContentBase64, "base64");
      const uint8View = new Uint8Array(buffer);

      setFileContent(uint8View);
      setFileLength(uint8View.length);

      Alert.alert("File loaded successfully");
    } catch (err) {
      if (DocumentPicker.isCancel(err)) {
        console.log("Canceled from document picker");
      } else {
        console.error("Error while picking or processing file:", err.message);
        Alert.alert("Error", `Failed to load file: ${err.message}`);
      }
    }
  };

  const calculateNbSector = (length) => {
    let sectors = Math.ceil(length / SECTOR_SIZE);
    setNbSector(sectors);
  };

  useEffect(() => {
    if (fileLength > 0) {
      calculateNbSector(fileLength);
    }
  }, [fileLength]);

  const handleUploadButtonClick = async () => {
    try {
      await writeBaseAddress(0x02, BASE_ADDRESS, nbSector);
      //  sliceAndSend();
    } catch (error) {
      console.error("Error starting file upload:", error.message);
      Alert.alert("Error", `Failed to start file upload: ${error.message}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Device Firmware Update</Text>
      <Button title="Load Firmware File" onPress={handleFileChange} />
      <TextInput
        style={styles.input}
        placeholder="Enter Start Sector"
        keyboardType="numeric"
        value={startSector}
        onChangeText={setStartSector}
      />
      <TextInput
        style={styles.input}
        placeholder="Enter Sector Count"
        keyboardType="numeric"
        value={sectorCount}
        onChangeText={setSectorCount}
      />
      <View style={styles.switchContainer}>
        <Switch
          value={manualySettingNbSector}
          onValueChange={setManualySettingNbSector}
        />
        <Text>Manually Set Nb Sector</Text>
      </View>
      {fileContent && (
        <>
          <Button title="Upload Firmware" onPress={handleUploadButtonClick} />
          {progress > 0 && (
            <ProgressBarAndroid
              styleAttr="Horizontal"
              progress={progress / 100}
            />
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  title: {
    fontSize: 24,
    marginBottom: 16,
  },
  input: {
    height: 40,
    borderColor: "gray",
    borderWidth: 1,
    marginBottom: 16,
    width: "100%",
    paddingHorizontal: 8,
  },
  switchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
});

export default DeviceDetails;
