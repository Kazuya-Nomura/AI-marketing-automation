import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider } from 'react-redux';
import { store } from './store';
import { 
  LoginScreen, 
  DashboardScreen, 
  LeadsScreen, 
  ContentApprovalScreen,
  NotificationsScreen 
} from './screens';
import { setupPushNotifications } from './services/notifications';

const Stack = createStackNavigator();

export default function App() {
  React.useEffect(() => {
    setupPushNotifications();
  }, []);

  return (
    <Provider store={store}>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Login">
          <Stack.Screen 
            name="Login" 
            component={LoginScreen} 
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="Dashboard" 
            component={DashboardScreen}
            options={{ title: 'FineAcers AI' }}
          />
          <Stack.Screen 
            name="Leads" 
            component={LeadsScreen}
            options={{ title: 'My Leads' }}
          />
          <Stack.Screen 
            name="ContentApproval" 
            component={ContentApprovalScreen}
            options={{ title: 'Approve Content' }}
          />
          <Stack.Screen 
            name="Notifications" 
            component={NotificationsScreen}
            options={{ title: 'Notifications' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </Provider>
  );
}