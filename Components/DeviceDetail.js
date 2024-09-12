import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ProgressBarAndroid,
  TouchableOpacity,
} from "react-native";
import RNFS from "react-native-fs";
import DocumentPicker from "react-native-document-picker";
import { Buffer } from "buffer";
import { useBluetoothCharacteristics } from "./BluetoothCharacteristics";
import Icon from "react-native-vector-icons/FontAwesome";
import Icons from "react-native-vector-icons/MaterialCommunityIcons";
import Toast from "react-native-toast-message";
import toastConfig from "./ToastConfig";

const CHUNK_LENGTH = 240;
const SECTOR_SIZE = 8 * 1024;
const BASE_ADDRESS = 0x080000;

const DeviceDetails = ({ route }) => {
  const { deviceId, deviceName, rssi } = route.params;
  const [fileContent, setFileContent] = useState([]);
  const [fileLength, setFileLength] = useState(0);
  const [fileSize, setFileSize] = useState(0);
  const [fileName, setFileName] = useState("");
  const [nbSector, setNbSector] = useState(0);
  const [progress, setProgress] = useState(0);
  const [readyToReceive, setReadyToReceive] = useState(false);

  const {
    writeAddressCharacteristic,
    writeWithoutResponseCharacteristic,
    indicateCharacteristic,
  } = useBluetoothCharacteristics(deviceId);

  const showToast = (type, title, message) => {
    Toast.show({
      type,
      position: "top",
      text1: title,
      text2: message,
      autoHide: true,
      topOffset: 30,
    });
  };

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
                console.log("Device ready to receive file.");
                sliceAndSend();
              } else if (indication === 0x01) {
                console.log("Rebooting...");
              } else if (indication === 0x03) {
                console.error("Error: Device not free to upload.");
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
      showToast(
        "error",
        "Error",
        "Write address characteristic not available."
      );
      console.error("Write address characteristic is not available.");
      return;
    }

    try {
      const baseAddressData = Buffer.alloc(5);
      baseAddressData[0] = 0x02;
      baseAddressData[1] = 0x08;
      baseAddressData[2] = 0x00;
      baseAddressData[3] = 0x00;
      baseAddressData[4] = sectorsToErase;

      const base64Data = baseAddressData.toString("base64");

      console.log("Writing base address data:", base64Data);

      await writeAddressCharacteristic.writeWithoutResponse(base64Data);
      showToast("success", "Success", "Write successful");
      console.log("Write successful");
    } catch (error) {
      showToast("error", "Error", "Failed to write base address.");
      console.error("Error writing to base address:", error.message);
    }
  };

  const calculateNbSector = (length) => {
    let sectors = Math.ceil(length / SECTOR_SIZE);
    setNbSector(sectors);
  };

  const handleFileChange = async () => {
    try {
      const res = await DocumentPicker.pick({
        type: ["application/octet-stream"],
      });

      const file = res[0];
      const fileUri = file.uri;
      const fileSize = file.size;
      const fileName = file.name;
      setFileName(fileName);
      setFileSize(fileSize);

      const fileContentBase64 = await RNFS.readFile(fileUri, "base64");
      const buffer = Buffer.from(fileContentBase64, "base64");
      const uint8View = new Uint8Array(buffer);
      setFileContent(uint8View);

      setFileLength(uint8View.length);
      calculateNbSector(uint8View.length);
    } catch (err) {
      if (DocumentPicker.isCancel(err)) {
        console.log("Canceled from document picker");
      } else {
        showToast(
          "error",
          "File Error",
          "Error while picking or processing file."
        );
        console.error("Error while picking or processing file:", err.message);
      }
    }
  };

  const writeRawData = async (dataChunk) => {
    if (!writeWithoutResponseCharacteristic) {
      showToast(
        "error",
        "Error",
        "Write without response characteristic not available."
      );
      console.error("Write without response characteristic is not available.");
      return;
    }

    try {
      const chunk = Buffer.from(dataChunk);
      if (chunk.length > CHUNK_LENGTH) {
        throw new Error("Chunk size exceeds the maximum allowed size.");
      }
      await writeWithoutResponseCharacteristic.writeWithoutResponse(
        chunk.toString("base64")
      );
      console.log("Raw data written:", dataChunk);
    } catch (error) {
      console.error("Error writing raw data:", error.message);
      showToast("error", "Error", "Failed to write raw data.");
    }
  };

  const sliceAndSend = async () => {
    console.log("Start the SliceAndSend");

    let totalBytesSent = 0;

    if (readyToReceive === true) {
      console.log("readyToReceive: Slice the Chunk");

      for (let start = 0; start < fileLength; start += CHUNK_LENGTH) {
        const end = Math.min(start + CHUNK_LENGTH, fileLength);
        const chunk = fileContent.slice(start, end);

        try {
          await writeRawData(chunk);

          totalBytesSent += chunk.length;
          setProgress((totalBytesSent / fileLength) * 100);

          console.log(
            `Chunk sent: ${chunk.length} bytes (${totalBytesSent} / ${fileLength})`
          );

          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error sending chunk: ${error.message}`);
          showToast(
            "error",
            "Upload Error",
            `Error sending chunk: ${error.message}`
          );
          return;
        }
      }

      await sendEndOfFileTransfer();
    }
  };

  const sendEndOfFileTransfer = async () => {
    try {
      const endOfFileTransfer = Buffer.from([0x06]);
      await writeAddressCharacteristic.writeWithoutResponse(
        endOfFileTransfer.toString("base64")
      );
      console.log("End of file transfer sent.");

      const fileUploadFinished = Buffer.from([0x07]);
      await writeAddressCharacteristic.writeWithoutResponse(
        fileUploadFinished.toString("base64")
      );
      console.log("File upload finished successfully.");
      showToast("success", "Success", "File upload finished successfully.");
    } catch (error) {
      console.error("Error sending end of file transfer:", error.message);
      showToast("error", "Error", "Failed to send end of file transfer.");
    }
  };

  useEffect(() => {
    if (fileLength > 0) {
      calculateNbSector(fileLength);
    }
  }, [fileLength]);

  const handleUploadButtonClick = async () => {
    if (!nbSector) {
      return;
    }
    try {
      await writeBaseAddress(0x02, BASE_ADDRESS, nbSector);
      sliceAndSend();
    } catch (error) {
      console.error("Error starting file upload:", error.message);
      showToast("error", "Upload Error", "Failed to start file upload.");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.fileContainer}>
        <View style={styles.fileTextContainer}>
          <Text style={styles.deviceText}>DeviceName : </Text>
          <Text>{deviceName}</Text>
        </View>
        <View style={styles.fileTextContainer}>
          <Text style={styles.deviceText}>DeviceID : </Text>
          <Text>{deviceId}</Text>
        </View>
        <View style={styles.fileTextContainer}>
          <Text style={styles.deviceText}>RSSI : </Text>
          <Text>{rssi} dbm</Text>
        </View>
      </View>
      <Text style={styles.title}>OTA Firmware Update</Text>

      <TouchableOpacity style={styles.loadButton} onPress={handleFileChange}>
        <Text style={styles.buttonText}>Upload Firmware File</Text>
        <Icon name="upload" size={30} color="#000" />
      </TouchableOpacity>

      {fileContent.length > 0 && (
        <>
          <View style={styles.fileContainer}>
            <View style={styles.fileTextContainer}>
              <Text style={styles.fileText}>File Name : </Text>
              <Text>{fileName}</Text>
            </View>
            <View style={styles.fileTextContainer}>
              <Text style={styles.fileText}>File Size : </Text>
              <Text>{fileSize}</Text>
            </View>
            <View style={styles.fileTextContainer}>
              <Text style={styles.fileText}>Sectors : </Text>
              <Text>{nbSector}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={handleUploadButtonClick}
          >
            <Text style={styles.buttonupText}>Start Upload</Text>
            <Icons name="rocket-launch-outline" size={20} color="#fff" />
          </TouchableOpacity>

          {progress > 0 && (
            <ProgressBarAndroid
              style={styles.progressBar}
              progress={progress / 100}
            />
          )}
        </>
      )}

      <Toast config={toastConfig} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#f5f5f5",
  },
  deviceInfo: {
    padding: 10,
    marginBottom: 20,
  },
  deviceText: {
    fontSize: 15,
    fontWeight: "500",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 24,
    color: "#333",
  },
  fileContainer: {
    display: "flex",
    alignItems: "start",
    justifyContent: "center",
    gap: 5,
    fontSize: 15,
    paddingVertical: 15,
    paddingHorizontal: 0,
  },
  fileTextContainer: {
    display: "flex",
    flexDirection: "row",
    alignItems: "start",
  },
  fileText: {
    fontWeight: "500",
  },
  loadButton: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 15,
    backgroundColor: "#fff",
    color: "#000",
    padding: 10,
    borderRadius: 4,
    marginBottom: 16,

    // iOS Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,

    // Android Shadow (elevation)
    elevation: 5,
  },

  uploadButton: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 15,
    backgroundColor: "#032B5B",
    padding: 10,
    borderRadius: 4,
    marginBottom: 16,
    elevation: 10,
  },

  buttonText: {
    fontSize: 16,
  },
  buttonupText: {
    color: "#fff",
    fontSize: 16,
  },
  progressBar: {
    width: "100%",
    height: 40,
    marginTop: 16,
  },
});

export default DeviceDetails;
