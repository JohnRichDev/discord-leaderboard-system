const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { QuickDB } = require("quick.db");
const db = new QuickDB();
const axios = require('axios');

require('dotenv').config();

async function query(data) {
	try {
		const response = await axios.post(
			"https://api-inference.huggingface.co/models/masonbarnes/discord-message-classifier",
			data, {
				headers: {
					Authorization: `Bearer ${process.env.HUGGINGFACE}`
				}
			}
		);
		return response.data;
	} catch (error) {
		console.error("Error querying API:", error);
		return null;
	}
}


const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.DirectMessages,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessages
	]
});

const roleIds = [
	"881880671897919639", // Grand
	"1131243620230512691", // Eminent
	"1130885215955468419", // Elite
	"1100347698160353320", // Honored
	"1130103607891607572", // Gracious
	"883722234068369469", // Noble
	"890086796778672168", // Valued
]

const banned_roles = [
	"881738016840896532",
	"1044260731463422043",
	"883306028710637589",
]

const voiceJoinTimestamps = new Map();
const usersInVC = [];
let previousLeaderboard = [];
async function updateRoles() {
	const leaderboard = await getLeaderboard();

	const changes = findLeaderboardChanges(leaderboard, previousLeaderboard);

	for (const change of changes) {
		const user = change.user;
		const newRank = change.newRank;

		const role = getRoleByRank(newRank);

		for (const roleId of roleIds) {
			if (user.roles.cache.has(roleId)) {
				await user.roles.remove(roleId);
			}
		}

		await user.roles.add(role.id);
	}

	previousLeaderboard = leaderboard;
}

async function getLeaderboard() {
	const allScores = [];
	server = client.guilds.cache.find((g) => g.id === process.env.GUILD_ID);
	await (await db.all()).forEach(async (data) => {
		const user = await server.members.cache.get((((data.id).split('_'))[0]));
		const score = data.value
		let foundRole = 0;
		banned_roles.forEach((roleId) => {
			if (user.roles.cache.find((r) => r.id === roleId)) return;
		})
		if (foundRole >= 1) return;
		allScores.push({
			user,
			score
		})
	});

	allScores.sort((a, b) => b.score - a.score);
	return allScores;
}

var server = null;
client.once('ready', async function() {
	console.log('Ready!');

	server = await client.guilds.cache.find((g) => g.id === process.env.GUILD_ID);
	await server.members.fetch();
	await server.voiceStates.cache.forEach(async (vs) => {
		if (vs.channel.id === '904383797049557003') return;
		if (vs.member.user.bot) return;

		voiceJoinTimestamps.set(vs.member.id, Date.now());
		usersInVC.push(vs.member.id);
	});
	setInterval(() => {
		usersInVC.forEach(async (userId) => {
			if ((getVCJoinTimeDiff(userId) % 5) === 0) {
				if (db.has(`${userId}_score`)) {
					await db.add(`${userId}_score`, 1);
				} else {
					await db.set(`${userId}_score`, 1);
				}
			}
		});
	}, 1000);
	const roles = []
	roleIds.forEach((roleId) => {
		roles.push(server.roles.cache.get(roleId))
	})
	const the_leaderboard = client.channels.cache.get("1220294227162828842");
	await the_leaderboard.messages.fetch();
	setInterval(async () => {
		updateRoles();
		if (the_leaderboard.lastMessage) await the_leaderboard.lastMessage.delete();
		const leaderboardEmbed = new EmbedBuilder()
			.setColor('#ffffff')
			.setTitle('Leaderboard')
			.setDescription('Here are the top citizens of Central:')
			.setTimestamp();

		const allScores = [];
		await (await db.all()).forEach(async (data) => {
			const user = await server.members.cache.get((((data.id).split('_'))[0]));
			const score = data.value
      let foundRole = 0;
      banned_roles.forEach((roleId) => {
        if (user.roles.cache.find((r) => r.id === roleId)) return;
      })
      if (foundRole >= 1) return;
			allScores.push({
				user,
				score
			})
		});

		allScores.sort((a, b) => b.score - a.score);
		allScores.forEach(async (item, index) => {
			if (index >= 16) return;
			await leaderboardEmbed.addFields({
				name: `${index + 1}. ${item.user.user.username}`,
				value: `Score: \`${item.score}\``,
				inline: false
			});
		})
		the_leaderboard.send({
			embeds: [leaderboardEmbed]
		});
	}, 300 * 1000)
});

client.on('messageCreate', (message) => {
	if (message.content.length >= 5) {
		if (message.author.bot) return;
		if (!message.content) return;
		query({
			"inputs": message.content
		}).then((response) => {
			if (response) {
				if (!(response[0][0]["label"] == 'spam' && response[0][0]["score"] >= 0.7)) {
					db.add(`${message.author.id}_score`, 1)
				}
			}
		});
	}
})

function findLeaderboardChanges(currentLeaderboard, previousLeaderboard) {
	const changes = [];

	currentLeaderboard.forEach((currentEntry, index) => {
		const previousEntry = previousLeaderboard[index];

		if (!previousEntry || currentEntry.user.id !== previousEntry.user.id) {
			changes.push({
				user: currentEntry.user,
				newRank: index + 1
			});
		}
	});

	return changes;
}

function getRoleByRank(rank) {
	const roleIndex = Math.ceil(rank / 2) - 1;
	return server.roles.cache.get(roleIds[roleIndex]);
}

client.on('interactionCreate', async (interaction) => {
	if (interaction.isCommand()) {
		if (interaction.commandName === 'score') {
			const targetUser = interaction.options.getUser('user') || interaction.user;
			const targetUserId = targetUser.id || interaction.user.id;

			const targetScore = await db.get(`${targetUserId}_score`);
			let position = 1;

			if (targetScore !== null) {
				const allScores = [];
				await Promise.all(usersInVC.map(async (userId) => {
					const score = await db.get(`${userId}_score`);
					if (score !== null) {
						allScores.push({
							userId,
							score
						});
					}
				}));

				allScores.sort((a, b) => b.score - a.score);

				const targetIndex = allScores.findIndex(item => item.userId === targetUserId);
				if (targetIndex !== -1) {
					position += targetIndex;
				}

				interaction.reply(`**${targetUser.username}** has a score of **${targetScore}** and is currently in position **${position}** on the leaderboard.`);
			} else {
				interaction.reply(`**${targetUser.username}** doesn't have a score yet.`);
			}
		}

		if (interaction.commandName === 'leaderboard') {
			const leaderboardEmbed = new EmbedBuilder()
				.setColor('#ffffff')
				.setTitle('Leaderboard')
				.setDescription('Here are the top citizens of Central:')
				.setTimestamp();

			const allScores = [];
			await (await db.all()).forEach(async (data) => {
				const user = await interaction.guild.members.cache.get((((data.id).split('_'))[0]));
				const score = data.value
        let foundRole = 0;
        banned_roles.forEach((roleId) => {
          if (user.roles.cache.find((r) => r.id === roleId)) return;
        })
        if (foundRole >= 1) return;
				allScores.push({
					user,
					score
				})
			});

			allScores.sort((a, b) => b.score - a.score);
			allScores.forEach(async (item, index) => {
				if (index >= 16) return;
				await leaderboardEmbed.addFields({
					name: `${index + 1}. ${item.user.user.username}`,
					value: `Score: \`${item.score}\``,
					inline: false
				});
			})

			interaction.reply({
				embeds: [leaderboardEmbed]
			});
		}
	}
});

client.on('voiceStateUpdate', (oldState, newState) => {
	const userId = newState.member.id;
	if (!oldState.channel && newState.channel) {
		voiceJoinTimestamps.set(userId, Date.now());
		usersInVC.push(userId);
	} else if (oldState.channel && !newState.channel) {
		const index = usersInVC.indexOf(userId);
		if (index !== -1) {
			usersInVC.splice(index, 1);
			voiceJoinTimestamps.delete(userId);
		}
	}
});

client.login(process.env.TOKEN);

function getVCJoinTimeDiff(userId) {
	const joinTime = voiceJoinTimestamps.get(userId);
	if (!joinTime) return 0;
	return Math.floor((Date.now() - joinTime) / 1000);
}