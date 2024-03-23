require('dotenv').config();
const { REST, Routes, ApplicationCommandOptionType }  = require('discord.js');

const commands = [
	{
		name: 'score',
		description: 'Shows your/user\'s current standing and score in the server!',
		options: [
			{
				name: 'user',
				description: 'User to check score',
				required: false,
				type: ApplicationCommandOptionType.User
			},
		]
	},
	{
		name: 'leaderboard',
		description: 'Shows the leaderboard',
	}
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
	try {
		console.log('Started refreshing application (/) commands.');
		await rest.put(Routes.applicationCommands(process.env.BOT_ID), { body: commands });
		console.log('Successfully reloaded application (/) commands.');
	} catch (error) {
		console.error(error);
	}
})();