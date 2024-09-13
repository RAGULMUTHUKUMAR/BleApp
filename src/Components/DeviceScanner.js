import React, { useState, useEffect, useCallback } from "react";
import {
  Text,
  View,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Alert,
  Animated,
  Easing,
  useColorScheme,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BleManager } from "react-native-ble-plx";
import Toast from "react-native-toast-message";
import toastConfig from "./ToastConfig";
import { requestPermissions, checkBluetoothStatus } from "./Utils/Permissions";
import {
  getManufacturerIcon,
  getRssiColor,
  getRssiIcon,
} from "./Utils/DeviceUi";

const bleManager = new BleManager();

const DeviceScanner = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const colorScheme = useColorScheme();
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState(null);
  const scanAnimation = useState(new Animated.Value(0))[0];

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
    if (route.params?.showSuccessToast) {
      showToast(
        "success",
        "OTA Update Complete",
        "The firmware has been successfully updated."
      );
    }
  }, [route.params]);

  useEffect(() => {
    requestPermissions();
    checkBluetoothStatus();

    const handleStateChange = (state) => {
      if (state !== "StatePoweredOn") {
        Alert.alert(
          "Bluetooth is off",
          "Please enable Bluetooth to use this feature.",
          [{ text: "OK" }]
        );
      }
    };

    const subscription = bleManager.onStateChange(handleStateChange, true);

    return () => {
      subscription.remove();
      bleManager.stopDeviceScan();
    };
  }, []);

  useEffect(() => {
    if (scanning) {
      startScanningAnimation();
    } else {
      scanAnimation.stopAnimation();
    }
  }, [scanning]);

  const startScanningAnimation = () => {
    scanAnimation.setValue(0);
    Animated.loop(
      Animated.timing(scanAnimation, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  };

  const scanDevices = useCallback(() => {
    setScanning(true);
    setDevices([]);
    setError(null);

    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        setError(error.message);
        setScanning(false);
        return;
      }

      setDevices((prevDevices) => {
        const existingDevice = prevDevices.find((d) => d.id === device.id);
        if (existingDevice) {
          return prevDevices.map((d) =>
            d.id === device.id ? { ...d, rssi: device.rssi } : d
          );
        } else {
          return [...prevDevices, device];
        }
      });
    });

    setTimeout(() => {
      bleManager.stopDeviceScan();
      setScanning(false);
    }, 20000);
  }, []);

  const handleDevicePress = (device) => {
    navigation.navigate("DeviceDetails", {
      deviceName: device.name,
      deviceId: device.id,
      rssi: device.rssi,
    });
  };

  return (
    <View
      style={[
        styles.container,
        colorScheme === "dark" ? styles.darkContainer : styles.lightContainer,
      ]}
    >
      <StatusBar
        barStyle={colorScheme === "dark" ? "light-content" : "dark-content"}
        backgroundColor={colorScheme === "dark" ? "#000000" : "#FFFFFF"}
      />
      <TouchableOpacity style={styles.scanButton} onPress={scanDevices}>
        <MaterialCommunityIcons name="bluetooth" size={24} color="white" />
        <Text style={styles.scanButtonText}>Scan for Bluetooth Devices</Text>
        {scanning && (
          <Animated.View
            style={[
              styles.scanIndicator,
              {
                transform: [
                  {
                    rotate: scanAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0deg", "360deg"],
                    }),
                  },
                ],
              },
            ]}
          >
            <MaterialCommunityIcons name="refresh" size={20} color="white" />
          </Animated.View>
        )}
      </TouchableOpacity>
      {scanning && (
        <ActivityIndicator size="large" color="#ffffff" style={styles.loader} />
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* Display number of devices */}
      <View style={styles.deviceCountContainer}>
        <Text style={styles.deviceCountText}>
          {devices.length} {devices.length === 1 ? "device" : "devices"} found
        </Text>
      </View>

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.deviceContainer,
              colorScheme === "dark"
                ? styles.darkDeviceContainer
                : styles.lightDeviceContainer,
            ]}
            onPress={() => handleDevicePress(item)}
          >
            <MaterialCommunityIcons
              name={getManufacturerIcon(item.name)}
              size={24}
              color={colorScheme === "dark" ? "white" : "black"}
              style={styles.deviceIcon}
            />
            <View style={styles.deviceInfoc}>
              <View style={styles.deviceInfo}>
                <Text
                  style={[
                    styles.deviceName,
                    { color: colorScheme === "dark" ? "white" : "black" },
                  ]}
                >
                  {item.name || "Unknown Device"}
                </Text>
                <Text
                  style={[
                    styles.deviceId,
                    { color: colorScheme === "dark" ? "#cccccc" : "black" },
                  ]}
                >
                  ID: {item.id}
                </Text>
                <Text
                  style={[
                    styles.deviceRssi,
                    { color: colorScheme === "dark" ? "#cccccc" : "black" },
                  ]}
                >
                  RSSI: {item.rssi || "N/A"} dBm
                </Text>
              </View>
              <View style={styles.rssiContainer}>
                <MaterialCommunityIcons
                  name={getRssiIcon(item.rssi)}
                  size={20}
                  color={getRssiColor(item.rssi)}
                />
                <Text style={styles.rssiInfoc}>Signal</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.list}
      />
      <Toast config={toastConfig} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  lightContainer: {
    backgroundColor: "#ffffff",
  },
  darkContainer: {
    backgroundColor: "#1e1e1e",
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#008ed3",
    padding: 15,
    borderRadius: 10,
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  scanButtonText: {
    color: "white",
    marginLeft: 10,
    fontSize: 16,
  },
  scanIndicator: {
    marginLeft: 10,
  },
  loader: {
    marginTop: 20,
  },
  errorText: {
    color: "red",
    marginTop: 10,
  },
  deviceCountContainer: {
    marginVertical: 5,
    alignItems: "start",
  },
  deviceCountText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#fff",
  },
  deviceContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    borderRadius: 8,
    marginBottom: 10,
  },
  darkDeviceContainer: {
    backgroundColor: "#333",
  },
  lightDeviceContainer: {
    backgroundColor: "#f9f9f9",
  },
  deviceIcon: {
    marginRight: 10,
  },
  deviceInfoc: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  deviceId: {
    fontSize: 12,
    color: "#555",
  },
  deviceRssi: {
    fontSize: 12,
    color: "#555",
  },
  rssiContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  rssiInfoc: {
    fontSize: 12,
    color: "#555",
  },
  list: {
    paddingBottom: 20,
  },
});

export default DeviceScanner;
