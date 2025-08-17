require("dotenv").config()

const { Client, GatewayIntentBits, Partials } = require("discord.js")
const TelegramBot = require("node-telegram-bot-api")

const DISCORD_TOKEN = process.env.DISCORD_TOKEN
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID
const SOURCE_DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID

const messageMappings = new Map()

const tgBot = new TelegramBot(TELEGRAM_TOKEN, { polling: false })
console.log("Telegram бот инициализирован.")

const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message], // Partials.Message важен для старых сообщений
})

discordClient.once("ready", () => {
  console.log(`Discord бот запущен как ${discordClient.user.tag}!`)
  console.log(`Слушаем канал: ${SOURCE_DISCORD_CHANNEL_ID}`)
})

function formatMessage(message) {
  const author = message.member ? message.member.displayName : message.author.username
  const time = message.createdAt.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  })
  return `**${author}** в ${time}:\n${message.content}`
}

discordClient.on("messageCreate", async (message) => {
  if (message.author.bot || message.channel.id !== SOURCE_DISCORD_CHANNEL_ID) {
    return
  }

  console.log(`Получено новое сообщение от ${message.author.username}.`)
  const textToSend = formatMessage(message)
  const imageAttachments = message.attachments.filter((att) => att.contentType?.startsWith("image/"))

  try {
    let sentMessages

    if (imageAttachments.size === 1) {
      const attachment = imageAttachments.first()
      sentMessages = [
        await tgBot.sendPhoto(TELEGRAM_CHAT_ID, attachment.url, {
          caption: textToSend,
          parse_mode: "Markdown",
        }),
      ]
    } else if (imageAttachments.size > 1) {
      const mediaGroup = imageAttachments.map((att, index) => ({
        type: "photo",
        media: att.url,
        caption: index === 0 ? textToSend : "", 
        parse_mode: "Markdown",
      }))
      sentMessages = await tgBot.sendMediaGroup(TELEGRAM_CHAT_ID, mediaGroup)
    } else {
      sentMessages = [await tgBot.sendMessage(TELEGRAM_CHAT_ID, textToSend, { parse_mode: "Markdown" })]
    }

    if (sentMessages && sentMessages.length > 0) {
      messageMappings.set(
        message.id,
        sentMessages.map((m) => m.message_id),
      )
      console.log(`Сообщение ${message.id} успешно переслано.`)
    }
  } catch (error) {
    console.error("Ошибка при пересылке нового сообщения:", error.message)
  }
})

discordClient.on("messageUpdate", async (oldMessage, newMessage) => {
  if (newMessage.partial) await newMessage.fetch()
  if (newMessage.author.bot || newMessage.channel.id !== SOURCE_DISCORD_CHANNEL_ID) {
    return
  }

  const mappedMessageIds = messageMappings.get(newMessage.id)
  if (!mappedMessageIds) {
    console.log(`Не найдено сопоставление для отредактированного сообщения ${newMessage.id}.`)
    return
  }

  console.log(`Сообщение ${newMessage.id} было отредактировано.`)
  const newText = formatMessage(newMessage)

  try {
    await tgBot.editMessageCaption(newText, {
      chat_id: TELEGRAM_CHAT_ID,
      message_id: mappedMessageIds[0],
      parse_mode: "Markdown",
    })
    console.log(`Сообщение в Telegram ${mappedMessageIds[0]} успешно отредактировано.`)
  } catch (error) {
    try {
      await tgBot.editMessageText(newText, {
        chat_id: TELEGRAM_CHAT_ID,
        message_id: mappedMessageIds[0],
        parse_mode: "Markdown",
      })
      console.log(`Сообщение в Telegram ${mappedMessageIds[0]} успешно отредактировано.`)
    } catch (e) {
      console.error("Ошибка при редактировании сообщения в Telegram:", e.message)
    }
  }
})

discordClient.on("messageDelete", async (message) => {
  if (message.channel.id !== SOURCE_DISCORD_CHANNEL_ID) {
    return
  }

  const mappedMessageIds = messageMappings.get(message.id)
  if (!mappedMessageIds) {
    console.log(`Не найдено сопоставление для удаленного сообщения ${message.id}.`)
    return
  }

  console.log(`Сообщение ${message.id} было удалено.`)
  try {
    for (const tgMessageId of mappedMessageIds) {
      await tgBot.deleteMessage(TELEGRAM_CHAT_ID, tgMessageId)
    }
    console.log("Соответствующие сообщения в Telegram удалены.")
    messageMappings.delete(message.id)
  } catch (error) {
    console.error("Ошибка при удалении сообщения в Telegram:", error.message)
  }
})

discordClient.login(DISCORD_TOKEN)
