import { useEffect, useMemo, useState } from 'react';
import { Button, PermissionsAndroid, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Protegey, ProtegeyKycProvider, useProtegeyKyc } from '@protegey/react-native-sdk';

const DEFAULT_API_KEY = process.env.EXPO_PUBLIC_PROTEGEY_API_KEY as string;
const DEFAULT_BASE_URL = process.env.EXPO_PUBLIC_PROTEGEY_BASE_URL as string;
const STORAGE_KEY = 'protegey-example-credentials';

// A fresh id per demo run — real integrations pass the end user's own stable id instead.
const CUSTOMER_ID = `customer-${Math.random().toString(36).slice(2, 8)}`;
const SESSION_ID = `rn-example-session-${Date.now()}`;

// <ProtegeyKycProvider> wraps the app once, near the root — it renders the KYC sheet (hidden
// until present() is called) as a sibling of the real app content.
export default function App() {
  return (
    <ProtegeyKycProvider>
      <Home />
    </ProtegeyKycProvider>
  );
}

function Home() {
  const [apiKey, setApiKey] = useState(DEFAULT_API_KEY);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [apiKeyInput, setApiKeyInput] = useState(DEFAULT_API_KEY);
  const [baseUrlInput, setBaseUrlInput] = useState(DEFAULT_BASE_URL);
  const [log, setLog] = useState<string[]>(['Waiting for device.identify()…']);
  const { present } = useProtegeyKyc();

  // Lets you point this app at any partner's key/environment at runtime, without rebuilding —
  // handy for testing against staging vs. production, or a different demo partner.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (!saved) return;
      const { apiKey: savedKey, baseUrl: savedUrl } = JSON.parse(saved);
      if (savedKey) {
        setApiKey(savedKey);
        setApiKeyInput(savedKey);
      }
      if (savedUrl) {
        setBaseUrl(savedUrl);
        setBaseUrlInput(savedUrl);
      }
    });
  }, []);

  const protegey = useMemo(() => new Protegey({ apiKey, baseUrl }), [apiKey, baseUrl]);

  const append = (line: string) => setLog((prev) => [...prev, line]);

  async function applyCredentials() {
    setApiKey(apiKeyInput);
    setBaseUrl(baseUrlInput);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey: apiKeyInput, baseUrl: baseUrlInput }));
    append(`Switched to baseUrl=${baseUrlInput}`);
  }

  async function identifyDevice() {
    try {
      const result = await protegey.device.identify({ externalCustomerId: CUSTOMER_ID });
      append(`device.identify() -> visitorId=${result.visitorId}, action=${result.action}`);
    } catch (err) {
      append(`device.identify() failed: ${(err as Error).message}`);
    }
  }

  // Typically called once on login/session start — done automatically here so a transaction
  // reported moments later for this same CUSTOMER_ID picks it up on its own (see the SDK docs'
  // Transactions section); the button below lets you trigger it again on demand.
  useEffect(() => {
    identifyDevice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protegey]);

  // No "report a transaction" call here on purpose: that call belongs server-to-server, from
  // your own backend (POST /partner-api/transactions), not from this app. device.identify()
  // above is this app's whole job — Protegey links the two automatically by CUSTOMER_ID.

  async function reportBehavioral() {
    try {
      const result = await protegey.behavioral.report({
        externalCustomerId: CUSTOMER_ID,
        sessionId: SESSION_ID,
        keystroke: { avgInterKeyLatencyMs: 145, typingSpeedCharsPerSec: 4.2, errorRate: 0.02 },
        touch: { avgSwipeVelocity: 22, scrollBehaviorScore: 0.8 },
        navigation: { screenSequence: ['login', 'dashboard', 'transfer', 'confirm'] },
      });
      // "learning" for the first 5 sessions of any given customer — expected, not an error.
      append(`behavioral.report() -> status=${result.status}, stepUpRecommended=${result.stepUpRecommended}`);
    } catch (err) {
      append(`behavioral.report() failed: ${(err as Error).message}`);
    }
  }

  async function startKyc() {
    // Ask up front, before the webview ever loads — relying only on the webview's own
    // permission-request bridge to the OS is less predictable across Android OEMs/versions than
    // just getting the OS permission granted first and letting the webview inherit it. iOS has no
    // equivalent upfront API here — WKWebView triggers the system prompt itself on first use,
    // backed by NSCameraUsageDescription in Info.plist.
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        append('Camera permission denied — identity verification needs camera access to scan your document and face.');
        return;
      }
    }

    try {
      // One call: starts the session AND shows it in a draggable sheet — the user never leaves
      // this app, and there's no UI code to write for that on our end.
      const status = await present(protegey.kyc, { externalUserId: CUSTOMER_ID });
      append(`KYC status -> ${status?.status ?? '(closed before a status arrived)'}`);
    } catch (err) {
      append(`kyc.startSession() failed: ${(err as Error).message}`);
    }
  }

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Protegey — React Native example</Text>
        <Text>
          Demonstrates this app's actual job: device intelligence, behavioral biometrics, and
          identity verification shown in an in-app sheet — the user never leaves this app.
          Transaction reporting isn't shown here: it belongs server-to-server, from your own
          backend.
        </Text>

        <View style={styles.settings}>
          <Text style={styles.settingsLabel}>API key</Text>
          <TextInput style={styles.input} value={apiKeyInput} onChangeText={setApiKeyInput} autoCapitalize="none" autoCorrect={false} placeholder="your-api-key" />
          <Text style={styles.settingsLabel}>Base URL</Text>
          <TextInput style={styles.input} value={baseUrlInput} onChangeText={setBaseUrlInput} autoCapitalize="none" autoCorrect={false} placeholder="https://api.protegey.com" />
          <Button title="Apply & reconnect" onPress={applyCredentials} />
        </View>

        <View style={styles.buttons}>
          <Button title="Identify device again" onPress={identifyDevice} />
          <Button title="Report a behavioral event" onPress={reportBehavioral} />
          <Button title="Verify my identity" onPress={startKyc} />
        </View>
        <Text style={styles.log}>{log.join('\n')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: 'bold' },
  settings: { gap: 6, padding: 12, backgroundColor: '#eef2ff', borderRadius: 4 },
  settingsLabel: { fontSize: 12, fontWeight: '600', color: '#444' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8, backgroundColor: '#fff' },
  buttons: { gap: 8 },
  log: { fontFamily: 'monospace', backgroundColor: '#f4f4f4', padding: 12, borderRadius: 4 },
});
