const { Events } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { handleBlockedAction } = require('../utils/blockHandler.js'); // adjust path if needed

// Memory list to track recently reverted members
const recentlyReverted = new Set();

module.exports = {
    name: 'guildMemberUpdate',
    async execute(config, oldMember, newMember) {
        console.log(`\n[Event] GuildMemberUpdate triggered for ${newMember.user.tag}`);

        if (recentlyReverted.has(newMember.id)) {
            console.log(`[Skip] ${newMember.user.tag} was recently reverted. Skipping processing.`);
            recentlyReverted.delete(newMember.id);
            return;
        }
        const botId = newMember.client.user.id;

        // Fetch latest audit log entry
        const fetchedLogs = await newMember.guild.fetchAuditLogs({
            limit: 1,
            type: 25 // MEMBER_ROLE_UPDATE
        });

        const roleChangeLog = fetchedLogs.entries.first();
        if (roleChangeLog) {
            const { executor, target, createdTimestamp } = roleChangeLog;

            if (target.id === newMember.id && executor.id === botId && (Date.now() - createdTimestamp) < 5000) {
                console.log(`[Skip] Bot made this change for ${newMember.user.tag}. Skipping processing.`);
                return;
            }
        }
        const oldRoles = new Set(oldMember.roles.cache.keys());
        const newRoles = new Set(newMember.roles.cache.keys());

        const addedRoles = [...newRoles].filter(role => !oldRoles.has(role));
        const removedRoles = [...oldRoles].filter(role => !newRoles.has(role));

        console.log(`[Info] Roles Added: ${addedRoles.length > 0 ? addedRoles.join(", ") : "None"}`);
        console.log(`[Info] Roles Removed: ${removedRoles.length > 0 ? removedRoles.join(", ") : "None"}`);

        const guild = newMember.guild;

        for (const roleId of addedRoles) {
            const role = guild.roles.cache.get(roleId);
            if (!role) {
                console.log(`[Warning] Could not fetch added role with ID: ${roleId}`);
                continue;
            }
            console.log(`[Action] Handling addition of role: ${role.name} (${role.id})`);
            await handleRoleChange(guild, newMember, role, "add");
        }

        for (const roleId of removedRoles) {
            const role = guild.roles.cache.get(roleId);
            if (!role) {
                console.log(`[Warning] Could not fetch removed role with ID: ${roleId}`);
                continue;
            }
            console.log(`[Action] Handling removal of role: ${role.name} (${role.id})`);
            await handleRoleChange(guild, newMember, role, "remove");
        }
    }
};

async function handleRoleChange(guild, member, role, actionType) {
    console.log(`[Function] handleRoleChange: ${member.user.tag} ${actionType} ${role.name}`);

    const liveRulesPath = path.join(__dirname, '..', 'roleRules.json');
    let liveRules;
    try {
        liveRules = JSON.parse(fs.readFileSync(liveRulesPath, 'utf8'));
        console.log(`[Load] Loaded role rules file successfully.`);
    } catch (err) {
        console.error(`[Error] Failed to load roleRules.json: ${err.message}`);
        return;
    }

    const rules = liveRules[role.id];

    console.log(`[Check] Is spacer role? Name: '${role.name}'`);
    if (/^[\s-]+$/.test(role.name.trim())) {
        console.log(`[Block] Role name only contains spaces/dashes. Reverting.`);
        await revertRoleChange(member, role, actionType);
        await notifyExecutor(guild, member, role, actionType, `⚠️ You cannot manually add or remove spacer roles.`);
        return;
    }

    if (!rules) {
        console.log(`[Allow] No special rules found for role: ${role.name}`);
        return;
    }

    if (rules.denyDirectChange) {
        console.log(`[Block] denyDirectChange=true for ${role.name}. Reverting.`);
        await revertRoleChange(member, role, actionType);
        await notifyExecutor(guild, member, role, actionType, `⚠️ You cannot manually ${actionType} the role **${role.name}**. Please use \`/role${actionType}\`.`);
        return;
    }

    if (rules.allowedRoles && rules.allowedRoles.length > 0) {
        console.log(`[Check] allowedRoles defined for ${role.name}: [${rules.allowedRoles.join(", ")}]`);
        const hasPermission = member.roles.cache.some(r => rules.allowedRoles.includes(r.id));
        console.log(`[Result] Member permission to ${actionType}: ${hasPermission}`);

        if (!hasPermission) {
            console.log(`[Block] Member lacks permission for ${actionType} of ${role.name}. Reverting.`);
            await revertRoleChange(member, role, actionType);
            await notifyExecutor(guild, member, role, actionType, `⚠️ You do not have permission to manually ${actionType} the role **${role.name}**.`);
            return;
        } else {
            console.log(`[Allow] Member is authorized for ${actionType} of ${role.name}.`);
        }
    } else {
        console.log(`[Allow] No allowedRoles restriction found. Allowing action.`);
    }
}

async function revertRoleChange(member, role, actionType) {
    console.log(`[Function] revertRoleChange: ${member.user.tag} ${actionType} ${role.name}`);
    try {
        recentlyReverted.add(member.id);

        if (actionType === "add") {
            await member.roles.remove(role, "Unauthorized role addition detected");
            console.log(`[Revert] Successfully removed unauthorized role: ${role.name}`);
        } else if (actionType === "remove") {
            await member.roles.add(role, "Unauthorized role removal detected");
            console.log(`[Revert] Successfully re-added unauthorized removed role: ${role.name}`);
        }
    } catch (error) {
        console.error(`[Error] Failed to revert ${actionType} for ${role.name}: ${error.message}`);
    }
}

async function notifyExecutor(guild, targetMember, role, actionType, reason) {
    console.log(`[Function] notifyExecutor: Target=${targetMember.user.tag}, Action=${actionType}, Role=${role.name}`);

    const botId = guild.client.user.id;
    console.log(`[Bot] Bot ID is ${botId}`);

    try {
        const fetchedLogs = await guild.fetchAuditLogs({
            limit: 10,
            type: 25
        });
        console.log(`[Audit] Successfully fetched audit logs.`);

        const roleChangeLog = fetchedLogs.entries.find(entry =>
            entry.target.id === targetMember.id &&
            entry.executor.id !== botId &&
            (Date.now() - entry.createdTimestamp) < 10000
        );

        if (!roleChangeLog) {
            console.log(`[Warning] No matching human audit log found for target: ${targetMember.user.tag}`);
            return;
        }

        const executor = roleChangeLog.executor;
        if (!executor) {
            console.log(`[Warning] Executor not found in audit entry.`);
            return;
        }

        const user = await guild.members.fetch(executor.id).catch(() => null);
        if (!user) {
            console.log(`[Warning] Failed to fetch executor member.`);
            return;
        }

        console.log(`[Found User] ${user.user.tag}`);

        // ✉️ First: Try to DM the executor directly
        try {
            await user.send(reason);
            console.log(`[Notify] Successfully DM'd executor: ${user.user.tag}`);
        } catch (dmError) {
            console.log(`[Notify] Could not DM executor ${user.user.tag}. Probably has DMs off.`);
        }

        // 📝 Then: Always log the blocked action to mod-log
        await handleBlockedAction(guild.client, user.user, reason, guild.id);
        console.log(`[Log] Successfully logged blocked action for ${user.user.tag}`);

    } catch (error) {
        console.error(`[Error] Failed during notifyExecutor process:`, error.message);
    }
}

