require("dotenv").config();
const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, PermissionsBitField } = require("discord.js");
const axios = require("axios");
const cheerio = require("cheerio");
const { REST } = require("@discordjs/rest");
const fs = require("fs");

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

let trackingCategories = {};
let lastListings = {};
const CHECK_INTERVAL = 60 * 1000;
let pingRole = "";
const TRACKING_FILE = "tracking_data.json";

// Load tracking data from file
if (fs.existsSync(TRACKING_FILE)) {
    trackingCategories = JSON.parse(fs.readFileSync(TRACKING_FILE));
}

const commands = [
    new SlashCommandBuilder().setName("track").setDescription("Track een Marktplaats categorie")
        .addStringOption(option => option.setName("url").setDescription("De URL van de categorie").setRequired(true))
        .addIntegerOption(option => option.setName("budget").setDescription("Maximale prijs in EUR").setRequired(false)),
    new SlashCommandBuilder().setName("untrack").setDescription("Stop met tracken van een categorie")
        .addStringOption(option => option.setName("category").setDescription("De naam van de categorie").setRequired(true)),
    new SlashCommandBuilder().setName("list").setDescription("Bekijk alle getrackte categorieën"),
    new SlashCommandBuilder().setName("help").setDescription("Toon help informatie"),
    new SlashCommandBuilder().setName("pingrole").setDescription("Stel een rol in voor meldingen")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addRoleOption(option => option.setName("role").setDescription("De rol die getagd moet worden").setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

async function registerCommands() {
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log("Slash commands registered");
    } catch (error) {
        console.error("❌ Error while registering commands:", error);
    }
}

async function fetchListings(url) {
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        let listings = [];
        let categoryName = $("h1").first().text().trim();

        $("div.hz-Listing-listview-content").each((i, el) => {
            let title = $(el).find("h3.hz-Listing-title").text().trim();
            let priceText = $(el).find("p.hz-Listing-price").text().trim() || "N/A";
            let link = $(el).find("a.hz-Listing-coverLink").attr("href");
            let price = parseInt(priceText.replace(/\D/g, "")) || 0;
            let isTopAd = $(el).hasClass("hz-Listing--featured");
            let description = $(el).find("p.hz-Listing-description").text().toLowerCase();
            
            if (link) link = `https://www.marktplaats.nl${link}`;
            if (title && link && !isTopAd && !description.includes("winkel") && !description.includes("factuur") && !description.includes("nieuw")) {
                listings.push({ title, price, link });
            }
        });

        return { listings, categoryName };
    } catch (error) {
        console.error(`❌ Error while recieving`, error);
        return { listings: [], categoryName: "Onbekend" };
    }
}

async function checkForNewListings() {
    for (const [url, { channelId, budget, category }] of Object.entries(trackingCategories)) {
        let { listings } = await fetchListings(url);
        if (!listings.length) continue;
        
        let newListings = listings.filter(item => !lastListings[url]?.includes(item.link) && (budget ? item.price <= budget : true));
        if (!newListings.length) continue;
        
        lastListings[url] = listings.map(item => item.link);
        
        let channel = await client.channels.fetch(channelId);
        newListings.forEach(item => {
            let message = `**New deal in ${category}!** 🔥\n\n📌 **${item.title}**\n💰 **€${item.price}**\n🔗 [Check Advertisement](${item.link})`;
            channel.send(message + (pingRole ? `\n${pingRole}` : ""));
        });
    }
}

client.once("ready", async () => {
    console.log(`✅ Bot is online as ${client.user.tag}`);
    await registerCommands();
    setInterval(checkForNewListings, CHECK_INTERVAL);
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    if (commandName === "track") {
        const url = options.getString("url");
        const budget = options.getInteger("budget") || null;
        let { categoryName } = await fetchListings(url);
        trackingCategories[url] = { channelId: interaction.channel.id, budget, category: categoryName };
        fs.writeFileSync(TRACKING_FILE, JSON.stringify(trackingCategories, null, 2));
        await interaction.reply(`✅ **${categoryName}** Is now being tracked${budget ? ` with a budget of€${budget}` : ""}`);
    }

    if (commandName === "list") {
        let trackedList = Object.values(trackingCategories).map(({ category, budget }) => `- **${category}**${budget ? ` (Max: €${budget})` : ""}`).join("\n");
        await interaction.reply(trackedList ? `📌 **Tracked categories:**\n${trackedList}` : "❌ No categories are followed, use /track.");
    }

    if (commandName === "pingrole") {
        let role = options.getRole("role");
        pingRole = role ? `<@&${role.id}>` : "";
        await interaction.reply(`✅ Messages now ping: ${role}`);
    }

    if (commandName === "help") {
        await interaction.reply("📢 **Marktplaats Bot Help**\n\n💡 Send a message to **M_0168** is u catch any bugs.\n\n**Available commands:**\n- `/track` - Follow a marktplaats category\n- `/untrack` - Stop following a marktplaats category\n- `/list` - Check all following categories\n- `/pingrole` - add a role to ping for new ads");
    }
});

client.login(TOKEN);
