import { App, TFile } from 'obsidian';
import { Calendar, DateInput } from 'fullcalendar';
import { CalendarView } from 'main';
import yaml from 'js-yaml'; 

export class CalendarEvent {
    start: string;
    end?: string;
    title: string;
    path: string;
}

class EventStore {
    app: App;
    calendarView: CalendarView;
    calendarFiles: TFile[] = [];
    calendarTags: { tagName: string, tagColor: string }[] = [];
    updating: boolean;

    constructor(app: App, calendarView: CalendarView) {
        this.app = app;
        this.calendarView = calendarView;
        this.updating = false;
    }

    async loadCalendarFiles() {
        const tempCalendarFiles: TFile[] = [];
        const files = this.app.vault.getFiles();
        const markdownFiles = files.filter(file => file.extension === 'md');
        for (const file of markdownFiles) {
            const content = await this.app.vault.read(file);
            if (this.hasCalendarTags(content)) {
                tempCalendarFiles.push(file);
            }
        }
        this.calendarFiles = tempCalendarFiles;
        this.updateView();
    }

    async moveCalendarFile(file: TFile, oldPath: string) {
        console.log(file);
        console.log(this.calendarFiles);
    }

    async moveEvent(event: { title: string, start: string, end?: string, id: string }) {
        const file = this.app.vault.getAbstractFileByPath(event.id) as TFile;
        if (!file) {
            console.error(`File not found: ${event.id}`);
            return;
        }
    
        const content = await this.app.vault.read(file);
        const fileData = this.getFrontmatter(content);
    
        fileData['start-date'] = this.formatDate(event.start);
        if (event.end) {
            const endDate = new Date(event.end);
            endDate.setDate(endDate.getDate() - 1); // re-de-increment the end date by 1
            fileData['end-date'] = this.formatDate(endDate);
        } else {
            delete fileData['end-date'];
        }
    
        const updatedContent = this.stringifyFrontmatter2(fileData, this.removeFrontmatter(content));
    
        await this.app.vault.modify(file, updatedContent);
    }
    
    removeFrontmatter(content: string): string {
        return content.replace(/---\n[\s\S]*?\n---\n/, '');
    }
    
    stringifyFrontmatter2(data: any, content: string = ''): string {
        const frontmatter = yaml.dump(data);
        return `---\n${frontmatter}---\n${content}`;
    }
    
    async updateView() {
        if (!this.updating) {
            this.updating = true;
            await this.calendarView.calendarReady;
            this.calendarView.calendar.removeAllEvents();
            for (const file of this.calendarFiles) {
                const startDate = this.formatStartDateString(this.getFrontmatter(await this.app.vault.read(file))['start-date']);
                const endDate = this.formatEndDateString(this.getFrontmatter(await this.app.vault.read(file))['end-date']);
                const backgroundColor = await this.getTagColor(file);
                await this.calendarView.calendarReady;
                if (endDate && startDate) {
                    this.calendarView.calendar.addEvent({ title: file.basename, start: startDate, end: endDate, id: file.path, backgroundColor });
                } else if (startDate) {
                    this.calendarView.calendar.addEvent({ title: file.basename, start: startDate, id: file.path, backgroundColor });
                }
            }
            this.updating = false;
        }
    }

    async createEvent(title: string, startDate: string, tags: string[], endDate?: string) {
        const frontmatterData: any = {
            title: title,
            'start-date': this.formatDate(startDate),
            tags: tags
        };

        if (endDate) {
            frontmatterData['end-date'] = this.formatDate(endDate);
        }

        const content = this.stringifyFrontmatter(frontmatterData);

        const newPath = `/${title}.md`;

        const file = await this.app.vault.create(newPath, content);

        await this.addEventToView(file);
    }

    async addEventToView(file: TFile) {
        if (!this.updating) {
            this.updating = true;
            await this.calendarView.calendarReady;
            const startDate = this.formatStartDateString(this.getFrontmatter(await this.app.vault.read(file))['start-date']);
            const endDate = this.formatEndDateString(this.getFrontmatter(await this.app.vault.read(file))['end-date']);
            const backgroundColor = await this.getTagColor(file);
            await this.calendarView.calendarReady;
            if (endDate && startDate) {
                this.calendarView.calendar.addEvent({ title: file.basename, start: startDate, end: endDate, id: file.path, backgroundColor });
            } else if (startDate) {
                this.calendarView.calendar.addEvent({ title: file.basename, start: startDate, id: file.path, backgroundColor });
            }
            this.updating = false;
        }
    }

    async getTagColor(file: TFile): Promise<string> {
        const content = this.getFrontmatter(await this.app.vault.read(file));
        const tags = content.tags;
        if (tags && Array.isArray(tags)) {
            const tag = tags.find(tag => this.calendarTags.some(ctag => ctag.tagName === tag));
            if (tag) {
                return this.calendarTags.find(ctag => ctag.tagName === tag)?.tagColor || '';
            }
        }
        return '';
    }

    isValidDate(dateString: string): boolean {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return false; // Invalid date
        }

        const [year, month, day] = dateString.split('-').map(Number);

        return (
            date.getFullYear() === year &&
            date.getMonth() === month - 1 &&
            date.getDate() === day
        );
    }

    formatDate(date: string | Date): string {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    formatStartDateString(date: string): string {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate() + 1).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    formatEndDateString(date: string): string {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate() + 2).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    getFrontmatter(content: string): any {
        const match = content.match(/---\n([\s\S]*?)\n---/);
        if (match) {
            return yaml.load(match[1]);
        }
        return {};
    }

    stringifyFrontmatter(data: any, content: string = ''): string {
        const frontmatter = yaml.dump(data);
        return `---\n${frontmatter}---\n${content}`;
    }

    hasCalendarTags(content: string): boolean {
        const tags = this.getFrontmatter(content).tags;
        if (tags && Array.isArray(tags)) {
            return this.calendarTags.map(tag => tag.tagName).some(tag => tags.includes(tag));
        }
        return false;
    }

    setCalendarTags(tags: { tagName: string, tagColor: string }[]) {
        this.calendarTags = tags;
        this.loadCalendarFiles();
    }

    getCalendarFiles(): TFile[] {
        return this.calendarFiles;
    }
}

export default EventStore;
