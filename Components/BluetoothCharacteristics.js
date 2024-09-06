// BluetoothCharacteristics.js
import { useState, useEffect } from 'react';
import { BleManager } from 'react-native-ble-plx';

const bleManager = new BleManager();

export const useBluetoothCharacteristics = (deviceId) => {
  const [writeAddressCharacteristic, setWriteAddressCharacteristic] = useState(null);
  const [indicateCharacteristic, setIndicateCharacteristic] = useState(null);
  const [writeWithoutResponseCharacteristic, setWriteWithoutResponseCharacteristic] = useState(null);

  useEffect(() => {
    const connectToDevice = async () => {
      try {
        const device = await bleManager.connectToDevice(deviceId);
        await device.discoverAllServicesAndCharacteristics();

        const services = await device.services();
        const service = services.find(s => s.uuid === '0000fe20-cc7a-482a-984a-7f2ed5b3e58f');

        if (!service) {
          throw new Error('OTA service not found');
        }

        const characteristics = await service.characteristics();
        setWriteAddressCharacteristic(characteristics.find(c => c.uuid === '0000fe22-8e22-4541-9d4c-21edae82ed19'));
        setIndicateCharacteristic(characteristics.find(c => c.uuid === '0000fe23-8e22-4541-9d4c-21edae82ed19'));
        setWriteWithoutResponseCharacteristic(characteristics.find(c => c.uuid === '0000fe24-8e22-4541-9d4c-21edae82ed19'));
      } catch (error) {
        console.error('Error connecting to device:', error);
      }
    };

    connectToDevice();

    return () => {
      bleManager.cancelDeviceConnection(deviceId);
    };
  }, [deviceId]);

  return {
    writeAddressCharacteristic,
    indicateCharacteristic,
    writeWithoutResponseCharacteristic,
  };
};
