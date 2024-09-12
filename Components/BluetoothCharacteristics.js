import { useEffect, useState } from 'react';
import { BleManager } from 'react-native-ble-plx';
import Toast from 'react-native-toast-message';

const showToasts = () => {
  Toast.show({
    type: 'error',
    position: 'top',
    text1: 'Error',
    text2: 'Please ensure your Bluetooth device is properly connected.',
    autoHide: true,
    topOffset: 30,
  });
};

export const useBluetoothCharacteristics = (deviceId) => {
  const [characteristics, setCharacteristics] = useState({
    writeAddressCharacteristic: null,
    writeWithoutResponseCharacteristic: null,
    indicateCharacteristic: null,
  });

  useEffect(() => {
    const manager = new BleManager();

    const fetchCharacteristics = async () => {
      try {
        const device = await manager.connectToDevice(deviceId);
        await device.discoverAllServicesAndCharacteristics();

        const services = await device.services();
        const allCharacteristics = [];

        for (const service of services) {
          const chars = await device.characteristicsForService(service.uuid);
          allCharacteristics.push(...chars);
        }

        const writeAddressCharacteristic = allCharacteristics.find(c => c.uuid === '0000fe22-8e22-4541-9d4c-21edae82ed19');
        const writeWithoutResponseCharacteristic = allCharacteristics.find(c => c.uuid === '0000fe24-8e22-4541-9d4c-21edae82ed19');
        const indicateCharacteristic = allCharacteristics.find(c => c.uuid === '0000fe23-8e22-4541-9d4c-21edae82ed19');

        setCharacteristics({
          writeAddressCharacteristic,
          writeWithoutResponseCharacteristic,
          indicateCharacteristic,
        });
      } catch (error) {
        console.error('Error fetching characteristics:', error.message);
        showToasts();
      }
    };

    fetchCharacteristics();

    return () => {
      manager.destroy(); 
    };
  }, [deviceId]);

  return characteristics;
};
