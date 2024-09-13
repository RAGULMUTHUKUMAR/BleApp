import { Platform, PermissionsAndroid, Alert } from 'react-native';
import { BleManager } from 'react-native-ble-plx';

const bleManager = new BleManager(); // Initialize BleManager

// Function to request Bluetooth permissions
export const requestPermissions = async () => {
  if (Platform.OS === 'android') {
    try {
      // Request necessary permissions
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
      ]);

      // Check if all permissions are granted
      const allPermissionsGranted =
        granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED &&
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE] === PermissionsAndroid.RESULTS.GRANTED;

      if (allPermissionsGranted) {
        console.log('All permissions granted');
      } else {
        Alert.alert(
          'Permissions Denied',
          'Required permissions were not granted. Please grant the permissions to use this feature.',
          [{ text: 'OK' }]
        );
      }
    } catch (err) {
      console.warn('Error requesting permissions:', err);
    }
  }
};

// Function to check if Bluetooth is enabled
export const checkBluetoothStatus = async () => {
  try {
    const state = await bleManager.state();
    if (state !== 'StatePoweredOn') {
      Alert.alert(
        'Bluetooth is off',
        'Please enable Bluetooth to use this feature.',
        [{ text: 'OK' }]
      );
    }
  } catch (err) {
    console.warn('Error checking Bluetooth status:', err);
  }
};
