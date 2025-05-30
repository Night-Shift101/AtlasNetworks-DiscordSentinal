// departmentedit.js — full command with paginated multi-role selector
const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ComponentType,
    InteractionType,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../utils/departments.json');

function buildRoleSelectPage(roles, page) {
    const pageSize = 25;
    const offset = page * pageSize;
    const sliced = roles.slice(offset, offset + pageSize);

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`select_role_page_${page}`)
            .setPlaceholder('Choose role(s) to add')
            .setMinValues(1)
            .setMaxValues(sliced.length)
            .addOptions(
                sliced.map(r => ({
                    label: r.name.slice(0, 100),
                    value: `${r.guildId}:${r.id}:${r.name.slice(0, 90)}`
                }))
            )
    );
}

function buildNavButtons(page, totalPages) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('prev_page')
            .setLabel('⬅️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),

        new ButtonBuilder()
            .setCustomId('next_page')
            .setLabel('➡️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1),

        new ButtonBuilder()
            .setCustomId('cancel_select')
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId('save_roles')
            .setLabel('💾 Save')
            .setStyle(ButtonStyle.Success)
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('departmentedit')
        .setDescription('Edit a department’s settings')
        .addStringOption(option =>
            option.setName('id')
                .setDescription('Department ID')
                .setRequired(true)),

    async execute(config, interaction) {
        if (!interaction.member.permissions.has('Administrator')) {
            return await interaction.reply({ content: 'You must be an administrator to use this command.', ephemeral: true });
        }

        const deptId = interaction.options.getString('id').toUpperCase();
        let departments = [];

        try {
            if (fs.existsSync(filePath)) {
                departments = JSON.parse(fs.readFileSync(filePath, 'utf8')).departments || [];
            }
        } catch (err) {
            console.error('[Error] Failed to read departments file:', err);
            return await interaction.reply({ content: 'Could not read department data.', ephemeral: true });
        }

        const dept = departments.find(d => d.id === deptId);
        if (!dept) {
            return await interaction.reply({ content: `Department "${deptId}" not found.`, ephemeral: true });
        }

        const select = new StringSelectMenuBuilder()
            .setCustomId('edit_department_setting')
            .setPlaceholder('Choose a setting to edit')
            .addOptions([
                { label: 'Name', value: 'name' },
                { label: 'Color (Hex)', value: 'color' },
                { label: 'Hierarchy', value: 'hierarchy' },
                { label: 'Roles', value: 'roles' }
            ]);

        const row = new ActionRowBuilder().addComponents(select);
        await interaction.reply({ content: `Editing department: **${dept.name}** (${deptId})`, components: [row], ephemeral: true });

        const msg = await interaction.fetchReply();
        const collector = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 30000 });

        collector.on('collect', async selectInteraction => {
            if (selectInteraction.user.id !== interaction.user.id) {
                return await selectInteraction.reply({ content: 'That’s not yours!', ephemeral: true });
            }

            const selected = selectInteraction.values[0];

            if (selected === 'roles') {
                const filteredGuilds = interaction.client.guilds.cache.filter(g => g.available);
                let hierarchy = [...dept.hierarchy];
                let roleRecords = [...dept.roles];

                const updateDisplay = async (int) => {
                    const description = hierarchy.length
                        ? hierarchy.map((r, i) => `\`${i + 1}.\` ${r}`).join('\n')
                        : '*No roles in hierarchy yet.*';
                    const embed = {
                        title: `Editing Roles for ${dept.name}`,
                        description,
                        color: 0x3498db,
                        footer: { text: 'Use buttons below to modify the hierarchy' }
                    };
                    await int.update({ embeds: [embed] });
                };

                await updateDisplay(selectInteraction);
                const msg = await selectInteraction.fetchReply();
                const btnCollector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });

                btnCollector.on('collect', async btn => {
                    if (btn.user.id !== interaction.user.id) return;

                    if (btn.customId === 'add_role') {
                        const guildOptions = filteredGuilds.map(g => ({ label: g.name, value: g.id }));
                        const guildSelect = new StringSelectMenuBuilder().setCustomId('select_guild').setPlaceholder('Select a guild').addOptions(guildOptions.slice(0, 25));
                        const row = new ActionRowBuilder().addComponents(guildSelect);
                        await btn.reply({ content: 'Choose a guild to pull roles from:', components: [row], ephemeral: true });
                    }

                    if (btn.customId === 'save_roles') {
                        dept.hierarchy = hierarchy;
                        dept.roles = roleRecords;
                        try {
                            fs.writeFileSync(filePath, JSON.stringify({ departments }, null, 2));
                            await btn.update({ content: `✅ Roles saved for ${dept.name}.`, components: [], embeds: [] });
                            btnCollector.stop();
                        } catch (err) {
                            await btn.reply({ content: '❌ Failed to save.', ephemeral: true });
                        }
                    }
                });

                interaction.client.on('interactionCreate', async guildSelect => {
                    if (!guildSelect.isStringSelectMenu() || guildSelect.customId !== 'select_guild') return;
                    if (guildSelect.user.id !== interaction.user.id) return;

                    const selectedGuildId = guildSelect.values[0];
                    const selectedGuild = interaction.client.guilds.cache.get(selectedGuildId);
                    await selectedGuild.roles.fetch();

                    const allRoles = selectedGuild.roles.cache
                        .filter(r => r.name.includes(' | ') && !r.managed && !r.tags?.botId)
                        .sort((a, b) => b.position - a.position)
                        .map(r => ({ guildId: selectedGuildId, id: r.id, name: r.name }));

                    if (allRoles.length === 0) {
                        return await guildSelect.reply({ content: '⚠️ No valid roles found.', ephemeral: true });
                    }

                    let page = 0;
                    const totalPages = Math.ceil(allRoles.length / 25);

                    const updatePage = async (int) => {
                        const selectRow = buildRoleSelectPage(allRoles, page);
                        const navButtons = buildNavButtons(page, totalPages);
                        await int.update({ content: `Choose role(s) (Page ${page + 1}/${totalPages}):`, components: [selectRow, navButtons] });
                    };

                    await guildSelect.update({ content: `Choose role(s) (Page 1/${totalPages}):`, components: [buildRoleSelectPage(allRoles, 0), buildNavButtons(0, totalPages)] });

                    const msg = await guildSelect.fetchReply();
                    const paginator = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 180000 });

                    paginator.on('collect', async btn => {
                        if (btn.user.id !== interaction.user.id) return;
                        if (btn.customId === 'prev_page') page--;
                        if (btn.customId === 'next_page') page++;
                        if (btn.customId === 'cancel_select') return await btn.update({ content: 'Cancelled.', components: [] });
                        await updatePage(btn);
                    });

                    interaction.client.on('interactionCreate', async roleSelect => {
                        if (!roleSelect.isStringSelectMenu() || !roleSelect.customId.startsWith('select_role_page_')) return;
                        if (roleSelect.user.id !== interaction.user.id) return;

                        for (const selected of roleSelect.values) {
                            const [guildId, roleId, ...nameParts] = selected.split(':');
                            const name = nameParts.join(':');
                            hierarchy.push(name);
                            roleRecords.push({ guildId, roleId, name });
                        }

                        await roleSelect.reply({ content: `✅ Added ${roleSelect.values.length} role(s).`, ephemeral: true });
                        await updateDisplay(await interaction.fetchReply());
                    });
                });
                return;
            }

            if (selected === 'hierarchy') {
                const modal = new ModalBuilder()
                    .setCustomId(`edit_hierarchy_${deptId}`)
                    .setTitle(`Edit Hierarchy for ${dept.name}`);
                const input = new TextInputBuilder()
                    .setCustomId('value')
                    .setLabel('Enter ranks (top to bottom, one per line)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('One rank per line')
                    .setRequired(true);
                const modalRow = new ActionRowBuilder().addComponents(input);
                modal.addComponents(modalRow);
                return await selectInteraction.showModal(modal);
            }

            const modal = new ModalBuilder()
                .setCustomId(`edit_${selected}_${deptId}`)
                .setTitle(`Edit Department ${selected}`);
            const input = new TextInputBuilder()
                .setCustomId('value')
                .setLabel(`New ${selected}`)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder(selected === 'color' ? '#FF0000' : selected === 'name' ? dept.name : selected);
            const modalRow = new ActionRowBuilder().addComponents(input);
            modal.addComponents(modalRow);
            await selectInteraction.showModal(modal);
        });

        interaction.client.on('interactionCreate', async modalInteraction => {
            if (!modalInteraction.isModalSubmit() || !modalInteraction.customId.startsWith('edit_')) return;
            const [, setting, id] = modalInteraction.customId.split('_');
            if (id !== deptId) return;
            const value = modalInteraction.fields.getTextInputValue('value');
            try {
                if (setting === 'name') dept.name = value;
                else if (setting === 'color') {
                    if (!/^#([0-9A-F]{6})$/i.test(value)) throw new Error('Invalid hex color');
                    dept.color = value;
                } else if (setting === 'hierarchy') {
                    const lines = value.split('\n').map(l => l.trim()).filter(Boolean);
                    if (lines.length < 1) throw new Error('At least one rank is required.');
                    dept.hierarchy = lines;
                } else {
                    return await modalInteraction.reply({ content: `Setting "${setting}" must be edited through a future GUI.`, ephemeral: true });
                }
                fs.writeFileSync(filePath, JSON.stringify({ departments }, null, 2));
                return await modalInteraction.reply({ content: `✅ Updated **${setting}** for **${dept.name}**.`, ephemeral: true });
            } catch (err) {
                console.error(err);
                return await modalInteraction.reply({ content: `❌ Failed to update: ${err.message}`, ephemeral: true });
            }
        });
    }
};
