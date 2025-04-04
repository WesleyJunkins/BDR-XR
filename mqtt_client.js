// MQTT Client for reading EEG power values
const mqtt = require('mqtt');

// MQTT Broker configuration
const brokerConfig = {
    protocol: 'wss',
    host: '21c4029e653247699764b7b976972f4f.s1.eu.hivemq.cloud',
    port: 8884,
    username: 'bdrXR1crimson',
    password: 'bdrXR1crimson',
    clientId: 'eeg_reader_' + Math.random().toString(16).substr(2, 8)
};

// Topic to subscribe to
const topic = 'bdrxr/connectorToWeb';

// Create MQTT client
const client = mqtt.connect(brokerConfig);

// Handle connection
client.on('connect', () => {
    console.log('Connected to MQTT broker');
    client.subscribe(topic, (err) => {
        if (!err) {
            console.log(`Subscribed to topic: ${topic}`);
        }
    });
});

// Handle incoming messages
client.on('message', (topic, message) => {
    try {
        const data = JSON.parse(message.toString());
        
        // Extract power value from the processed data
        if (data.processedData && data.processedData.powerValue) {
            const powerValue = data.processedData.powerValue;
            console.log(`Power Value: ${powerValue}%`);
        }
    } catch (error) {
        console.error('Error parsing message:', error);
    }
});

// Handle errors
client.on('error', (error) => {
    console.error('MQTT Error:', error);
});

// Handle connection close
client.on('close', () => {
    console.log('Disconnected from MQTT broker');
});

// Handle reconnection
client.on('reconnect', () => {
    console.log('Reconnecting to MQTT broker...');
}); 