import { App, ItemView, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, EventRef, Modal, TextComponent, ButtonComponent, TFile } from 'obsidian';
import { Calendar } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import EventStore from './EventStore';
import matter from 'gray-matter';

// Define interface and default settings
interface CalendarPluginSettings {
    calendarTags: {tagName: string, tagColor: string}[];
}

const DEFAULT_SETTINGS: CalendarPluginSettings = {
    calendarTags: [{tagName: "calendar", tagColor: ""}],
};

const VIEW_TYPE_CALENDAR = "calendar-view";


class EventEditModal extends Modal {
    event: any;
    plugin: CalendarPlugin;
    filePath: string;

    constructor(app: App, event: any, plugin: CalendarPlugin, filePath: string) {
        super(app);
        this.event = event;
        this.plugin = plugin;
        this.filePath = filePath;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Edit Event' });
		
        // Tags Input
        const tagsContainer = contentEl.createDiv({ cls: 'input-container' });
        tagsContainer.createEl('label', { text: 'Tags' });
        const tagsInput = new TextComponent(tagsContainer);
        const tags = await this.getTagsFromFile();
        tagsInput.setValue(tags);


        // Buttons
        const buttonsEl = contentEl.createDiv({ cls: 'modal-buttons' });

        new ButtonComponent(buttonsEl)
            .setButtonText('Save')
            .onClick(async () => {
                await this.updateFile(tagsInput.getValue());
                this.close();
            });

        new ButtonComponent(buttonsEl)
            .setButtonText('Cancel')
            .onClick(() => this.close());

        // Add some custom styles
        this.addStyles();
    }

	async updateFile(newTags: string) {
        try {
            const file = this.plugin.app.vault.getAbstractFileByPath(this.filePath);
            if (file instanceof TFile) {
                const fileContent = await this.plugin.app.vault.read(file);
                const parsed = matter(fileContent);
                parsed.data.tags = newTags.split(',').map(tag => tag.trim());
                const newContent = matter.stringify(parsed.content, parsed.data);
                await this.plugin.app.vault.modify(file, newContent);
            } else {
                console.error("File not found or is not a valid file:", this.filePath);
            }
        } catch (error) {
            console.error("Failed to update file:", error);
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }

    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .input-container {
                margin-bottom: 20px;
            }
            .input-container label {
                display: block;
                margin-bottom: 5px;
            }
            .modal-buttons {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
            }
        `;
        document.head.appendChild(style);
    }

    async getTagsFromFile(): Promise<string> {
        try {
            const file = this.plugin.app.vault.getAbstractFileByPath(this.filePath);
            if (file instanceof TFile) {
                const fileContent = await this.plugin.app.vault.read(file);
                const parsed = matter(fileContent);
                const tags = parsed.data.tags;
                return tags ? tags.join(' ') : '';
            } else {
                console.error("File not found or is not a valid file:", this.filePath);
                return '';
            }
        } catch (error) {
            console.error("Failed to read file:", error);
            return '';
        }
    }
}


export class CalendarView extends ItemView {
    calendar: Calendar;
    plugin: CalendarPlugin;
    calendarReady: Promise<void>;
    private calendarReadyResolve: () => void;
    private calendarCreated: boolean;

    constructor(leaf: WorkspaceLeaf, plugin: CalendarPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.calendarReady = new Promise((resolve) => {
            this.calendarReadyResolve = resolve;
        });
    }

    getViewType() {
        return VIEW_TYPE_CALENDAR;
    }

    getDisplayText() {
        return "Calendar";
    }

    async createCalendar() {
        this.calendarCreated = true;
        const container = this.containerEl.children[1];
        container.empty();
        const calendarEl = container.createEl("div", { attr: { id: "calendar" } });
        this.calendar = new Calendar(calendarEl as HTMLElement, {
            plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
            initialView: 'dayGridMonth',
            selectable: true,
            editable: true,
            eventBorderColor: 'transparent',
            eventDrop: this.handleEventDrop.bind(this),
            eventClick: this.handleEventClick.bind(this),
            select: this.handleDateSelect.bind(this)  // Add the select callback here
        });
    }

    async onOpen() {
        if (!this.calendarCreated) {
            this.createCalendar()
        }
        this.calendar.render();
        this.calendarReadyResolve();
    }

    async onClose() {
        if (this.calendar) {
            this.calendar.destroy();
        }
    }

    async onResize() {
        console.log("resized window");
        this.calendar.render();
    }

    handleEventDrop(info: any) {
        const { event } = info;
        this.plugin.eventStore.moveEvent(event);
        console.log('Event dropped:', event.title);
        console.log('New start date:', event.start.toISOString());
    }

    handleEventClick(info: any) {
        const { event } = info;
        console.log('Event clicked:', event.title);
        const filePath = event.id;
        new EventEditModal(this.plugin.app, info.event, this.plugin, filePath).open();
    }

	handleDateSelect(info: any) {
		console.log('Date(s) selected:', info.startStr, info.endStr);
	
		let endDate = new Date(info.endStr);
		endDate.setDate(endDate.getDate() - 1);
		let adjustedEndStr = endDate.toISOString().split('T')[0];
		if (adjustedEndStr == info.startStr) {
			adjustedEndStr = ""
		}

		new DateSelectModal(this.plugin.app, info.startStr, adjustedEndStr, this.plugin.eventStore).open();
	}
}

class DateSelectModal extends Modal {
    startDate: string;
    endDate: string;
	eventStore: EventStore;

    constructor(app: App, startDate: string, endDate: string, eventStore: EventStore) {
        super(app);
        this.startDate = startDate;
		this.eventStore = eventStore;
        this.endDate = endDate;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'New Event' });

        // Start Date
        const startDateContainer = contentEl.createDiv({ cls: 'input-container' });
        startDateContainer.createEl('label', { text: 'Start Date' });
        const startDateInput = new TextComponent(startDateContainer);
        startDateInput.setValue(this.startDate);

        // End Date
        const endDateContainer = contentEl.createDiv({ cls: 'input-container' });
        endDateContainer.createEl('label', { text: 'End Date' });
        const endDateInput = new TextComponent(endDateContainer);
        endDateInput.setValue(this.endDate);

        // Event Title
        const titleContainer = contentEl.createDiv({ cls: 'input-container' });
        titleContainer.createEl('label', { text: 'Title' });
        const titleInput = new TextComponent(titleContainer);

        const tagsContainer = contentEl.createDiv({ cls: 'input-container' });
        tagsContainer.createEl('label', { text: 'Tags' });
        const tagsInput = new TextComponent(tagsContainer);

        // Buttons
        const buttonsEl = contentEl.createDiv({ cls: 'modal-buttons' });

		new ButtonComponent(buttonsEl)
		.setButtonText('Save')
		.onClick(() => {
			const title = titleInput.getValue();
            console.log(title)
			const startDate = new Date(startDateInput.getValue());
			const tags = tagsInput.getValue().split(" ");
	
			startDate.setDate(startDate.getDate() + 1);

			// Increment start date and end date by 1 day
			if (endDateInput.getValue()){
				const endDate = new Date(endDateInput.getValue());
				endDate.setDate(endDate.getDate() + 1);
				
				this.eventStore.createEvent(title, startDate.toISOString().split('T')[0], tags, endDate.toISOString().split('T')[0]);
				console.log('Event saved:', title, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0], tags);
			} else {
				
				this.eventStore.createEvent(title, startDate.toISOString().split('T')[0], tags );
				console.log('Event saved:', title, startDate.toISOString().split('T')[0], tags);
			}
	
			this.close();
		});
        new ButtonComponent(buttonsEl)
            .setButtonText('Cancel')
            .onClick(() => this.close());

        // Add some custom styles
        this.addStyles();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }

    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .input-container {
                margin-bottom: 20px;
            }
            .input-container label {
                display: block;
                margin-bottom: 5px;
            }
            .modal-buttons {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
            }
        `;
        document.head.appendChild(style);
    }
}


class CalendarSettingTab extends PluginSettingTab {
    plugin: CalendarPlugin;
    tagSettingsContainer: HTMLElement;
    tagSettingsList: { tagName: string, tagColor: string }[] = [];

    constructor(app: App, plugin: CalendarPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Calendar Settings' });

        this.tagSettingsContainer = containerEl.createDiv({ cls: 'tag-settings-container' });

        this.loadExistingTagSettings();

        new ButtonComponent(containerEl)
            .setButtonText('Add Tag Settings')
            .onClick(() => {
                this.addTagSetting();
            });

        new ButtonComponent(containerEl)
            .setButtonText('Save Tag Settings')
            .onClick(async () => {
                await this.saveTagSettings();
            });
    }

    loadExistingTagSettings(): void {
        if (this.plugin.settings.calendarTags) {
            this.plugin.settings.calendarTags.forEach(tag => {
                this.addTagSetting(tag.tagName, tag.tagColor);
            });
        }
    }

    addTagSetting(tagName: string = '', tagColor: string = ''): void {
        const settingDiv = this.tagSettingsContainer.createDiv({ cls: 'tag-setting' });

        const nameInput = new TextComponent(settingDiv);
        nameInput.setPlaceholder('Tag Name');
        nameInput.setValue(tagName);

        const colorInput = new TextComponent(settingDiv);
        colorInput.setPlaceholder('Tag Color');
        colorInput.inputEl.type = 'color';
        colorInput.setValue(tagColor);

        const removeButton = new ButtonComponent(settingDiv)
            .setButtonText('Remove')
            .onClick(() => {
                settingDiv.remove();
                this.tagSettingsList = this.tagSettingsList.filter(tag => tag.tagName !== nameInput.getValue() || tag.tagColor !== colorInput.getValue());
            });

        this.tagSettingsList.push({ tagName: nameInput.getValue(), tagColor: colorInput.getValue() });
    }

    async saveTagSettings(): Promise<void> {
        this.plugin.settings.calendarTags = [];
        this.tagSettingsContainer.querySelectorAll('.tag-setting').forEach(settingDiv => {
            const nameInput = settingDiv.querySelector('input[type=text]') as HTMLInputElement;
            const colorInput = settingDiv.querySelector('input[type=color]') as HTMLInputElement;
            if (nameInput.value && colorInput.value) {
                this.plugin.settings.calendarTags.push({ tagName: nameInput.value, tagColor: colorInput.value });
            }
        });
		
		this.plugin.eventStore.setCalendarTags(this.plugin.settings.calendarTags);
		await this.plugin.eventStore.loadCalendarFiles();
        await this.plugin.saveSettings();
    }
}



export default class CalendarPlugin extends Plugin {
    settings: CalendarPluginSettings;
    eventStore: EventStore;
    calendarView: CalendarView;
    private eventRefs: EventRef[] = [];

    async onload() {
        console.log('Loading Calendar Plugin');
        await this.loadSettings();

        this.app.workspace.onLayoutReady(async () => {
            console.log("Obsidian layout is ready");

            const leaf = this.app.workspace.getRightLeaf(false);
            if (leaf) {
                this.calendarView = new CalendarView(leaf, this);

                this.eventStore = new EventStore(this.app, this.calendarView);
                this.eventStore.setCalendarTags(this.settings.calendarTags);
                await this.eventStore.loadCalendarFiles();
                
                const calendarFiles = this.eventStore.getCalendarFiles();
                console.log('Calendar Files:', calendarFiles);

                this.registerView(
                    VIEW_TYPE_CALENDAR,
                    () => this.calendarView
                );

                this.addRibbonIcon('calendar', 'Open Calendar', () => {
                    this.activateView();
                });

                this.addCommand({
                    id: 'open-calendar',
                    name: 'Open Calendar',
                    callback: () => {
                        this.activateView();
                    }
                });

                this.addSettingTab(new CalendarSettingTab(this.app, this));
            } else {
                console.error('Failed to get right leaf');
            }
        });

        // Add file modification and rename listeners
        this.registerEvent(this.app.vault.on('modify', this.handleFileModify.bind(this)));
        this.registerEvent(this.app.vault.on('rename', this.handleFileRename.bind(this)));
        this.registerEvent(this.app.vault.on('delete', this.handleFileDelete.bind(this)));
    }

    async handleFileModify(file: TFile) {
        console.log(`File modified: ${file.path}`);
        // this should be better
        await this.eventStore.loadCalendarFiles();
        this.calendarView.calendar.refetchEvents();
    }

    async handleFileDelete(file: TFile) {
        console.log(`File deleted: ${file.path}`);
        this.calendarView.calendar.getEventById(file.path)?.remove();
    }

    async handleFileRename(file: TFile, oldPath: string) {
        console.log(`File renamed/moved: ${oldPath} -> ${file.path}`);
		await this.calendarView.calendarReady;
		this.calendarView.calendar.getEventById(oldPath)?.remove()
		
		this.eventStore.addEventToView(file);
        this.calendarView.calendar.refetchEvents();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    onunload() {
        console.log('Unloading Calendar Plugin');
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_CALENDAR);
        this.eventRefs.forEach(ref => this.app.vault.offref(ref));
    }

    async activateView() {
        const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR)[0];
        if (leaf) {
            this.app.workspace.revealLeaf(leaf);
        } else {
            const newLeaf = this.app.workspace.getRightLeaf(false);
            if (newLeaf) {
                await newLeaf.setViewState({
                    type: VIEW_TYPE_CALENDAR,
                    active: true
                });
                this.app.workspace.revealLeaf(newLeaf);
            } else {
                console.error('Failed to create or reveal calendar view');
            }
        }
    }
}
