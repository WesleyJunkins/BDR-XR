/**
 * Standalone Node.js MQTT client for reading EEG power values from the BDR-XR broker.
 * Use this to test the MQTT pipeline or log incoming data without running the browser app.
 * Run with: npm start (or node mqtt_client.js)
 */

const mqtt = require('mqtt');

// Broker connection settings: HiveMQ Cloud over secure WebSockets (WSS)
const brokerConfig = {
    protocol: 'wss',
    host: '21c4029e653247699764b7b976972f4f.s1.eu.hivemq.cloud',
    port: 8884,
    username: 'bdrXR1crimson',
    password: 'bdrXR1crimson',
    // Unique client ID per run to avoid conflicts when multiple clients connect
    clientId: 'eeg_reader_' + Math.random().toString(16).substr(2, 8)
};

// MQTT topic where the external connector (e.g. EEG pipeline) publishes processed data
const topic = 'bdrxr/connectorToWeb';

// Create and connect the MQTT client using the config above
const client = mqtt.connect(brokerConfig);

// Fired when connection to the broker is established
client.on('connect', () => {
    console.log('Connected to MQTT broker');
    // Subscribe to the connector topic; callback reports subscription success or error
    client.subscribe(topic, (err) => {
        if (!err) {
            console.log(`Subscribed to topic: ${topic}`);
        }
    });
});

// Fired for each message received on the subscribed topic(s)
client.on('message', (topic, message) => {
    try {
        // Incoming payload is JSON; parse to access processedData.powerValue
        const data = JSON.parse(message.toString());
        // Expected structure: { processedData: { powerValue: "0.000" } }
        if (data.processedData && data.processedData.powerValue) {
            const powerValue = data.processedData.powerValue;
            console.log(`Power Value: ${powerValue}%`);
        }
    } catch (error) {
        console.error('Error parsing message:', error);
    }
});

// Fired on connection or protocol errors
client.on('error', (error) => {
    console.error('MQTT Error:', error);
});

// Fired when the connection to the broker is closed
client.on('close', () => {
    console.log('Disconnected from MQTT broker');
});

// Fired when the client is attempting to reconnect after a disconnect
client.on('reconnect', () => {
    console.log('Reconnecting to MQTT broker...');
});
