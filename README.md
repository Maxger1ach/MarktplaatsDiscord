# Marktplaats Discord Bot

A Discord bot that tracks Marktplaats categories and notifies you when new listings pop up.

## Features

- **Track**: Follow specific Marktplaats categories and get notifications when new stuff shows up.
- **Untrack**: Stop following a category whenever you want.
- **Budget**: You can set a budget to filter listings based on price.
- **Ping Role**: Set a role to get pings when there are new listings.
- **Help**: Need info? Get a quick rundown of commands.

## Commands

- `/track <url> [budget]`: Start tracking a Marktplaats category. Optionally set a budget to filter listings.
- `/untrack <category>`: Stop tracking a category.
- `/list`: Show all the categories you're tracking.
- `/pingrole <role>`: Set a role to be pinged when new listings show up (you need the `Manage Server` permission for this).
- `/help`: Get a list of all commands.

## How It Works

Once you start tracking a category, the bot will keep an eye out for new listings. It checks every minute to see if there are any fresh deals that match the criteria (including your budget, if set). If it finds something new, it sends a message to your Discord channel with all the details.

## Example Commands

- Track a category with a budget:
/track https://www.marktplaats.nl/l/elektronica/c3330 [budget: 200]


- See what you're tracking:
/list

- Set a ping role to get notified:
/pingrole @Admins

## File Structure

- `bot.js`: The main bot script where all the magic happens.
- `tracking_data.json`: Saves the categories you're tracking.
- `.env`: Contains your bot token and client ID (keep this secret!).
- `package.json`: Project dependencies and info.

## License

This project is under the MIT License. Do whatever you want with it.

---
