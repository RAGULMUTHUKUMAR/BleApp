import { useEffect, useState } from 'react';
import { BleManager } from 'react-native-ble-plx';

const SERVICE_UUID = '0000FE20-cc7a-482a-984a-7f2ed5b3e58f'; // OTA Service UUID

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
        const characteristics = [];


        console.log('services: ', services);

        for (const service of services) {
          const chars = await device.characteristicsForService(service.uuid);
          characteristics.push(...chars);
        }

        console.log(characteristics);
        

        const writeAddressCharacteristic = characteristics.find(c => c.uuid === '0000fe22-8e22-4541-9d4c-21edae82ed19');
        const writeWithoutResponseCharacteristic = characteristics.find(c => c.uuid === '0000fe24-8e22-4541-9d4c-21edae82ed19');

        const indicateCharacteristic = characteristics.find(c => c.uuid === '0000fe23-8e22-4541-9d4c-21edae82ed19');

        setCharacteristics({
          writeAddressCharacteristic,
          writeWithoutResponseCharacteristic,
          indicateCharacteristic,
        });
      } catch (error) {
        console.error('Error fetching characteristics:', error.message);
      }
    };

    fetchCharacteristics();

    return () => {
      manager.cancelDeviceConnection(deviceId);
    };
  }, [deviceId]);

  return characteristics;
};
