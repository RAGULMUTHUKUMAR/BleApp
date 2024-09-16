import { useEffect, useState } from "react";
import { BleManager } from "react-native-ble-plx";
import Toast from "react-native-toast-message";

const showToast = (type, title, message) => {
  Toast.show({
    type,
    position: "top",
    text1: title,
    text2: message,
    autoHide: true,
    topOffset: 20,
  });
};

const OTA_SERVICE_UUID = "0000fe20-cc7a-482a-984a-7f2ed5b3e58f";
const P2P_SERVICE_UUID = "0000fe40-cc7a-482a-984a-7f2ed5b3e58f";

export const useBluetoothCharacteristics = (deviceId) => {
  const [characteristics, setCharacteristics] = useState({
    writeAddressCharacteristic: null,
    writeWithoutResponseCharacteristic: null,
    indicateCharacteristic: null,
    p2pLedCharacteristic: null,
    p2pSwitchCharacteristic: null,
  });

  useEffect(() => {
    const manager = new BleManager();

    const fetchCharacteristics = async () => {
      try {
        const device = await manager.connectToDevice(deviceId);
        await device.discoverAllServicesAndCharacteristics();

        const services = await device.services();
        // console.log(
        //   "Discovered Services:",
        //   services.map((s) => s.uuid)
        // );

        const otaService = services.find(
          (service) => service.uuid === OTA_SERVICE_UUID
        );
        const p2pService = services.find(
          (service) => service.uuid === P2P_SERVICE_UUID
        );

        if (!otaService || !p2pService) {
          throw new Error("Required service(s) not found");
        }

        // console.log("OTA Service Found:", otaService);
        // console.log("P2P Service Found:", p2pService);

        const otaCharacteristics = await device.characteristicsForService(
          OTA_SERVICE_UUID
        );
        const p2pCharacteristics = await device.characteristicsForService(
          P2P_SERVICE_UUID
        );

        // console.log("OTA Characteristics:", otaCharacteristics.map(c => c.uuid));
        // console.log("P2P Characteristics:", p2pCharacteristics.map(c => c.uuid));

        const writeAddressCharacteristic = otaCharacteristics.find(
          (c) => c.uuid === "0000fe22-8e22-4541-9d4c-21edae82ed19"
        );
        const writeWithoutResponseCharacteristic = otaCharacteristics.find(
          (c) => c.uuid === "0000fe24-8e22-4541-9d4c-21edae82ed19"
        );
        const indicateCharacteristic = otaCharacteristics.find(
          (c) => c.uuid === "0000fe23-8e22-4541-9d4c-21edae82ed19"
        );

        const p2pLedCharacteristic = p2pCharacteristics.find(
          (c) => c.uuid === "0000fe41-8e22-4541-9d4c-21edae82ed19" 	
        );
        const p2pSwitchCharacteristic = p2pCharacteristics.find(
          (c) => c.uuid === "0000fe42-8e22-4541-9d4c-21edae82ed19"
        );

        setCharacteristics({
          writeAddressCharacteristic,
          writeWithoutResponseCharacteristic,
          indicateCharacteristic,
          p2pLedCharacteristic,
          p2pSwitchCharacteristic,
        });

        showToast("success", "Success", "OTA and P2P services fetched.");
      } catch (error) {
        console.error("Error fetching characteristics:", error.message);
        showToast(
          "error",
          "Error",
          "An error occurred while fetching services or characteristics. Please try again."
        );
      }
    };

    fetchCharacteristics();

    return () => {
      manager.destroy();
    };
  }, [deviceId]);

  return characteristics;
};
