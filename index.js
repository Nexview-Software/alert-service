const _ = require('lodash');
const AWS = require('aws-sdk');
const { client, xml } = require('@xmpp/client');
const { username, password, queueUrl: QueueUrl } = require('/home/ubuntu/alert-service/config');

AWS.config.loadFromPath('/home/ubuntu/alert-service/credentials.json');

const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

const xmpp = client({
    service: 'xmpps://nwws-oi.weather.gov:5223',
    username,
    password
});

xmpp.on('error', (err) => {
    console.error('x', err.toString());
});

xmpp.on('offline', () => {
    console.log('-', 'offline');
});

xmpp.on('stanza', async (stanza) => {
    if (stanza.is('iq')) {
        stanza.children.map(async (child) => {
            if (child.name === 'ping') {
                const pong = (
                    xml('iq', {
                        to: stanza.attrs.from,
                        id: stanza.attrs.id,
                        from: stanza.attrs.to,
                        type: 'result'
                    })
                );
                console.log('Sending response to ping...');
                await xmpp.send(pong);
                console.log('Pong!');
            }
        });
    }

    if (stanza.is('message')) {
        const stanzaAttr = stanza.children.find(x => { return x.name === 'x'; });
        if (_.get(stanzaAttr, 'attrs.awipsid')) {
            switch (stanzaAttr.attrs.awipsid.substr(0, 3)) {
                case 'FFW':
                case 'SVR':
                case 'SMW':
                case 'TOR':
                    const objData = {};
                    const pol = stanza.children.find(x => { return x.name === 'x'; });
                    const coords = pol.children[0].match(/(?<=LAT\.{3}LON\s).+?(?=[^\d\s])/sg)[0]
                        .replace(/\r?\n|\r/g, ' ')
                        .split(' ')
                        .filter(val => val)
                        .map((val, idx) => {
                            return idx % 2 === 0 ? val / 100 : -1 * (val / 100);
                        })
                        .reduce((result, value, index, array) => {
                            if (index % 2 === 0) {
                                result.push(array.slice(index, index + 2));
                            }
                            return result;
                        }, []);
                    coords.push([ coords[0][0], coords[0][1] ]);
                    const metadataArr = pol.children[0].match(/(?<=\n\n\d+\n\n.+\n\n.+\n\n.+\n\n\/).+?(?=[\/])/sg)[0].split('.');
                    const dateArr = metadataArr[6].split('-');
                    const messageParams = {
                        DelaySeconds: 0,
                        MessageAttributes: {
                            Coordinates: {
                                DataType: 'String',
                                StringValue: JSON.stringify(coords)
                            },
                            ProductClass: {
                                DataType: 'String',
                                StringValue: metadataArr[0]
                            },
                            Action: {
                                DataType: 'String',
                                StringValue: metadataArr[1]
                            },
                            OfficeID: {
                                DataType: 'String',
                                StringValue: metadataArr[2]
                            },
                            Phenomena: {
                                DataType: 'String',
                                StringValue: metadataArr[3]
                            },
                            Significance: {
                                DataType: 'String',
                                StringValue: metadataArr[4]
                            },
                            EventTrackingNumber: {
                                DataType: 'String',
                                StringValue: metadataArr[5]
                            },
                            EventStartTime: {
                                DataType: 'String',
                                StringValue: dateArr[0]
                            },
                            EventEndTime: {
                                DataType: 'String',
                                StringValue: dateArr[1]
                            },
                        },
                        MessageBody: pol.children[0],
                        QueueUrl
                    };
                    sqs.sendMessage(messageParams, (err, data) => {
                        if (err) {
                            console.error('Error', err);
                        } else {
                            console.log('Success', data.messageId);
                        }
                    });
                    break;
                default:
                    break;
            }
        }
    }
});

xmpp.on('online', async (address) => {
    console.log('o', 'online as', address.toString());

    const message = (
        xml('presence', {
            to: `nwws@conference.nwws-oi.weather.gov/${ username }`
        })
    );

    await xmpp.send(message);
});

xmpp.start().catch(console.error);