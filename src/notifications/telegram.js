const config = require('config');
const Telegraf = require('telegraf');
const Markup = require('telegraf/markup');
const logger = require('../common/logger').logger;


/**
 * Telegram Notifier
 */
class TelegramNotifier {
    /**
     * Find the API keys from the config
     */
    constructor() {
        this.telegramBotToken = config.get('telegram.botToken');
        this.safeUser = config.get('telegram.safeUser');
        this.client = null;
        this.exchangeManager = null;
        this.lastChatId = null;
    }

    /**
     * Called at startup - use this to start listening
     */
    init() {
        // Kick off the telegram bot, so it is listening for messages
        this.startTelegramBot();
    }

    /**
     * Give us access to the exchange manager, so we can route messages from the bot to the exchange
     * @param manager
     */
    setExchangeManager(manager) {
        this.exchangeManager = manager;
    }

    /**
     * Send a notification to Telegram
     * @param msg
     */
    send(msg) {
        // Can only do this if we are in a chat.
        if (!this.lastChatId) {
            logger.error('Could not send notification to Telegram as not in a chat');
            return;
        }

        // send the message
        this.client.telegram.sendMessage(this.lastChatId, msg);
    }

    /**
     * Determine if the user that's just contacted is 'safe'
     * ie, are they in the whitelist
     * @param userId
     * @returns {boolean}
     */
    isSafeUser(userId) {
        // no restrictions
        if (!this.safeUser || this.safeUser === '' || this.safeUser === 0) {
            return true;
        }

        if (this.safeUser === userId) {
            return true;
        }

        return false;
    }

    /**
     * Start the telegram bot if we have a token
     */
    startTelegramBot() {
        if (!this.telegramBotToken || this.telegramBotToken === '') {
            return;
        }

        // Set up a telegram bot too...
        const bot = new Telegraf(this.telegramBotToken);
        this.client = bot;

        // Handle chats starting
        bot.start((ctx) => {
            if (this.isSafeUser(ctx.message.from.id)) {
                this.lastChatId = ctx.message.chat.id;
                ctx.reply('Yep...');
            }
            logger.progress(`Chat started on Telegram. Chat ID: ${ctx.message.chat.id}. User Id: ${ctx.message.from.id}`);
        });

        // Handle requests for help
        bot.help(ctx => ctx.reply(
            'Send me a message and I\'ll give it a go...\n' +
            '`/help` - This message\n' +
            '`/list` - List your custom shortcuts.\n' +
            '`/shortcut name` - Use the named shortcut', { parse_mode: 'Markdown' }));

        // If someone sends us a sticker...
        bot.on('sticker', ctx => setTimeout(() => ctx.reply('👍🖥💰📈'), 1000));

        bot.command('shortcut', async (ctx) => {
            if (this.isSafeUser(ctx.message.from.id) && this.exchangeManager) {
                this.lastChatId = ctx.message.chat.id;
                const regex = /\/shortcut\s+(.*)/i;
                const m = regex.exec(ctx.message.text);
                if (m !== null) {
                    const name = m[1];
                    logger.progress(`Running shortcut from Telegram: ${name}`);

                    const shortcuts = config.get('telegram.shortcuts');
                    const match = shortcuts.find(item => item.name === name);
                    if (match) {
                        // execute the message and respond when everything is done
                        await Promise.all(this.exchangeManager.executeMessage(match.message, config.get('credentials')));
                        ctx.reply(`Just finished working on\n\`${match.message}\`\n🤞`, { parse_mode: 'Markdown' });
                    }
                }
            }
        });

        // Handle the /list command
        bot.command('list', async (ctx) => {
            if (this.isSafeUser(ctx.message.from.id)) {
                logger.progress('Showing list of shortcuts in Telegram chat');
                const shortcuts = config.get('telegram.shortcuts');
                const msg = shortcuts.reduce((fullMsg, item) => `${fullMsg}\n\`/shortcut ${item.name}\` - ${item.message}`, 'Found the following shortcuts...');
                const cmds = [];
                shortcuts.forEach((element) => {
                    cmds.push(`/shortcut ${element.name}`);
                });
                ctx.replyWithMarkdown(msg, Markup
                    .keyboard(cmds)
                    .oneTime()
                    .resize()
                    .extra(),
                );
            }
        });

        // Handle an actual message
        bot.on('message', async (ctx) => {
            if (this.isSafeUser(ctx.message.from.id) && this.exchangeManager) {
                this.lastChatId = ctx.message.chat.id;
                logger.progress('Generic message from Telegram chat');
                ctx.reply('Working on it 👍');

                // Just push the messages off to be process (don't wait for them)
                this.exchangeManager.executeMessage(ctx.message.text, config.get('credentials'));
            } else {
                // Not from a known user, so log something
                logger.progress('Telegram message from unknown user');
                logger.dim(ctx.message);
            }
        });

        // Handle any errors
        bot.catch((err) => {
            logger.error('Telegram Bot has seen an error');
            logger.error(err);
        });

        // Start listening
        bot.startPolling();
        logger.results('\nTelegram bot is listening for messages...\n');
    }
}

module.exports = TelegramNotifier;
