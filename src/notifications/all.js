const SmsNotifier = require('./sms');
const SlackNotifier = require('./slack');
const TelegramNotifier = require('./telegram');
const Webhook = require('./webhook');

// A list of all the supported exchanges
module.exports = [
    {
        name: 'sms',
        driver: new SmsNotifier(),
    },
    {
        name: 'webhook',
        driver: new Webhook(),
    },
    {
        name: 'slack',
        driver: new SlackNotifier(),
    },
    {
        name: 'telegram',
        driver: new TelegramNotifier(),
    },
];
