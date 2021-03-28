const _ = require('lodash');
const { client, xml } = require('@xmpp/client');
const { username, password } = require('./config');

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
                case 'TOR':
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

                    console.log(pol);
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