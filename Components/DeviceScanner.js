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
  PermissionsAndroid,
  Platform,
  Animated,
  Easing,
  useColorScheme,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BleManager } from "react-native-ble-plx";

const bleManager = new BleManager();

const requestPermissions = async () => {
  if (Platform.OS === "android") {
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
      ]);

      if (
        granted["android.permission.ACCESS_FINE_LOCATION"] ===
          PermissionsAndroid.RESULTS.GRANTED &&
        granted["android.permission.BLUETOOTH_SCAN"] ===
          PermissionsAndroid.RESULTS.GRANTED &&
        granted["android.permission.BLUETOOTH_CONNECT"] ===
          PermissionsAndroid.RESULTS.GRANTED &&
        granted["android.permission.BLUETOOTH_ADVERTISE"] ===
          PermissionsAndroid.RESULTS.GRANTED
      ) {
        console.log("All permissions granted");
      } else {
        Alert.alert("Permissions Denied", "Required permissions were not granted.");
      }
    } catch (err) {
      console.warn(err);
    }
  }
};

const checkBluetoothStatus = async () => {
  const state = await bleManager.state();
  if (state !== "StatePoweredOn") {
    Alert.alert(
      "Bluetooth is off",
      "Please enable Bluetooth to use this feature.",
      [{ text: "OK" }]
    );
  }
};

const DeviceScanner = () => {
  const navigation = useNavigation();
  const colorScheme = useColorScheme();
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState(null);
  const scanAnimation = useState(new Animated.Value(0))[0];

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
    }, 10000);
  }, []);

  const handleDevicePress = (device) => {
    navigation.navigate("DeviceDetail", { deviceId: device.id });
  };

  const getManufacturerIcon = (name) => {
    return name ? "bluetooth" : "bluetooth-off";
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
      />
      <TouchableOpacity style={styles.scanButton} onPress={scanDevices}>
        <MaterialCommunityIcons name="bluetooth" size={24} color="white" />
        <Text style={styles.scanButtonText}>Scan for Devices</Text>
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
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.list}
      />
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
    backgroundColor: "#007BFF",
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
    fontSize: 18,
  },
  scanIndicator: {
    marginLeft: 10,
  },
  loader: {
    marginVertical: 20,
  },
  errorText: {
    color: "red",
    marginVertical: 10,
    textAlign: "center",
  },
  deviceContainer: {
    flexDirection: "row",
    padding: 15,
    marginBottom: 10,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#f9f9f9",
  },
  lightDeviceContainer: {
    backgroundColor: "#ffffff",
  },
  darkDeviceContainer: {
    backgroundColor: "#2e2e2e",
  },
  deviceIcon: {
    marginRight: 15,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  deviceId: {
    fontSize: 14,
    marginTop: 5,
  },
  deviceRssi: {
    fontSize: 12,
    marginTop: 5,
  },
  list: {
    paddingBottom: 20,
  },
});

export default DeviceScanner;
