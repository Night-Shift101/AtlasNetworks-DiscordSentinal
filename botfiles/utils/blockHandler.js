// File: utils/blockHandler.js
const { Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const blockedUsers = new Collection();
const blockCounts = new Collection();

const BLOCK_LIMIT = 3;
const TIME_WINDOW = 60 * 1000;
const TIMEOUT_DURATION = 5 * 60 * 1000;

const activeEscalations = new Collection(); // For tracking which escalation belongs to who

async function handleBlockedAction(client, user, reason, triggeredGuildId) {
    console.log(`[Debug] handleBlockedAction triggered for user ${user.tag} with reason: ${reason}`);

    const now = Date.now();
    const userId = user.id;

    if (blockedUsers.has(userId)) {
        const timeoutEnds = blockedUsers.get(userId);
        if (now < timeoutEnds) {
            console.log(`[Security] Ignoring actions from ${user.tag}, they are currently timed out.`);
            return { ignored: true };
        } else {
            blockedUsers.delete(userId);
            console.log(`[Security] Timeout expired for ${user.tag}`);
        }
    }

    if (!blockCounts.has(userId)) blockCounts.set(userId, []);
    const timestamps = blockCounts.get(userId);
    timestamps.push(now);

    const updatedTimestamps = timestamps.filter(ts => now - ts <= TIME_WINDOW);
    blockCounts.set(userId, updatedTimestamps);

    console.log(`[Security] User ${user.tag} now has ${updatedTimestamps.length} blocked actions in the last minute.`);

    const config = require('../config.json');

    // 🔥 Always fetch the MAIN GUILD ID for logging
    const mainGuildId = config.generalSettings.mainGuildId; // Add this to config.json!
    const mainGuild = client.guilds.cache.get(mainGuildId);
    if (!mainGuild) {
        console.error(`[Security Error] Could not find main guild ${mainGuildId}`);
        return { ignored: false };
    }

    const modLogChannelId = config.modLogChannels?.[mainGuildId];
    const staffRoleId = config.staffRoles?.[mainGuildId];

    if (!modLogChannelId || !staffRoleId) {
        console.error(`[Security Error] No mod-log channel or staff role configured for main guild ${mainGuildId}`);
        return { ignored: false };
    }

    const staffChannel = await mainGuild.channels.fetch(modLogChannelId).catch(() => null);
    if (!staffChannel) {
        console.error(`[Security Error] Failed to fetch mod log channel for main guild ${mainGuild.name}`);
        return { ignored: false };
    }

    const triggeredGuild = client.guilds.cache.get(triggeredGuildId);
    const triggeredGuildName = triggeredGuild ? triggeredGuild.name : "Unknown Guild";

    const embed = new EmbedBuilder()
        .setTitle('🚨 Blocked Action Detected')
        .addFields(
            { name: 'User', value: `${user} (${user.tag})`, inline: false },
            { name: 'Triggered Guild', value: triggeredGuildName, inline: false },
            { name: 'Reason', value: reason, inline: false },
            { name: 'Blocked Attempts (last minute)', value: `${updatedTimestamps.length}`, inline: true }
        )
        .setColor('Red')
        .setTimestamp();

    const components = [];

    if (updatedTimestamps.length >= BLOCK_LIMIT) {
        embed.addFields({ name: '⚠️ Escalation', value: `User exceeded block limit!\n<@&${staffRoleId}> please review immediately.` });

        // Timeout the user globally
        blockedUsers.set(userId, now + TIMEOUT_DURATION);
        console.log(`[Security] Timeout applied to ${user.tag} for ${TIMEOUT_DURATION / 60000} minutes.`);

        // Add Cancel Timeout Button
        const buttonRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`cancel_timeout_${userId}`)
                    .setLabel('Cancel Timeout ⏳')
                    .setStyle(ButtonStyle.Danger)
            );
        components.push(buttonRow);

        activeEscalations.set(userId, triggeredGuildId);
    }

    await staffChannel.send({ embeds: [embed], components: components });
    console.log(`[Security] Logged blocked action for ${user.tag} in main guild ${mainGuild.name}`);

    return { ignored: false };
}

module.exports = { handleBlockedAction, blockedUsers, activeEscalations };
