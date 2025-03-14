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
let pingRole = ""; // Standaard geen ping
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
        console.log("✅ Slash commands geregistreerd (globaal)!");
    } catch (error) {
        console.error("❌ Fout bij registreren commands:", error);
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
        console.error(`❌ Fout bij ophalen:`, error);
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
            let message = `**Nieuwe Deal in ${category}!** 🔥\n\n📌 **${item.title}**\n💰 **€${item.price}**\n🔗 [Bekijk Advertentie](${item.link})`;
            channel.send(message + (pingRole ? `\n${pingRole}` : ""));
        });
    }
}

client.once("ready", async () => {
    console.log(`✅ Bot is online als ${client.user.tag}`);
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
        await interaction.reply(`✅ **${categoryName}** wordt nu gevolgd${budget ? ` met een budget van €${budget}` : ""}`);
    }

    if (commandName === "list") {
        let trackedList = Object.values(trackingCategories).map(({ category, budget }) => `- **${category}**${budget ? ` (Max: €${budget})` : ""}`).join("\n");
        await interaction.reply(trackedList ? `📌 **Getrackte categorieën:**\n${trackedList}` : "❌ Geen categorieën worden gevolgd.");
    }

    if (commandName === "pingrole") {
        let role = options.getRole("role");
        pingRole = role ? `<@&${role.id}>` : "";
        await interaction.reply(`✅ Meldingen worden nu gestuurd naar: ${role}`);
    }

    if (commandName === "help") {
        await interaction.reply("📢 **Marktplaats Sniper Help**\n\n💡 Stuur een bericht naar **M_0168** bij fouten.\n\n**Beschikbare commands:**\n- `/track` - Volg een Marktplaats categorie\n- `/untrack` - Stop met tracken van een categorie\n- `/list` - Bekijk alle getrackte categorieën\n- `/pingrole` - Stel een rol in voor meldingen");
    }
});

client.login(TOKEN);
