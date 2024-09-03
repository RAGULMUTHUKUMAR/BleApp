import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import DeviceScanner from './Components/DeviceScanner';
import DeviceDetail from './Components/DeviceDetail';

const Stack = createStackNavigator();

const App = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="DeviceScanner">
        <Stack.Screen name="DeviceScanner" component={DeviceScanner} />
        <Stack.Screen name="DeviceDetail" component={DeviceDetail} /> 
      </Stack.Navigator>
    </NavigationContainer>
  );
};


export default App;
