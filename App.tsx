import { useEffect, useState } from 'react';
import { Button, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Protegey, ProtegeyKycProvider, useProtegeyKyc } from '@protegey/react-native-sdk';

// In a real app, read these from your own env config (e.g. react-native-dotenv, Expo's
// EXPO_PUBLIC_ env vars) — never hardcode a production API key.
const protegey = new Protegey({
  apiKey: process.env.EXPO_PUBLIC_PROTEGEY_API_KEY as string,
  baseUrl: process.env.EXPO_PUBLIC_PROTEGEY_BASE_URL as string,
});

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
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>(['Waiting for device.identify()…']);
  const { present } = useProtegeyKyc();

  const append = (line: string) => setLog((prev) => [...prev, line]);

  async function identifyDevice() {
    try {
      const result = await protegey.device.identify({ externalCustomerId: CUSTOMER_ID });
      setVisitorId(result.visitorId);
      append(`device.identify() -> visitorId=${result.visitorId}, action=${result.action}`);
    } catch (err) {
      append(`device.identify() failed: ${(err as Error).message}`);
    }
  }

  // Typically called once on login/session start — done automatically here so the rest of the
  // demo already has a visitorId to fold in; the button below lets you trigger it again on demand.
  useEffect(() => {
    identifyDevice();
  }, []);

  async function reportTransaction() {
    try {
      const result = await protegey.transactions.report({
        externalTransactionId: `rn-example-${Date.now()}`,
        externalCustomerId: CUSTOMER_ID,
        direction: 'DEBIT',
        amount: 5000,
        currency: 'XAF',
        transactionType: 'test',
        visitorId: visitorId ?? undefined,
      });
      append(`transactions.report() -> decision=${result.decision}, riskScore=${result.riskScore}`);
    } catch (err) {
      append(`transactions.report() failed: ${(err as Error).message}`);
    }
  }

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
          Demonstrates every @protegey/react-native-sdk module: device intelligence, transaction
          reporting, behavioral biometrics, and identity verification shown in an in-app sheet —
          the user never leaves this app.
        </Text>
        <View style={styles.buttons}>
          <Button title="Identify device again" onPress={identifyDevice} />
          <Button title="Report a test transaction" onPress={reportTransaction} />
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
  buttons: { gap: 8 },
  log: { fontFamily: 'monospace', backgroundColor: '#f4f4f4', padding: 12, borderRadius: 4 },
});
