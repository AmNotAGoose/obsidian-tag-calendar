import { App, TFile } from 'obsidian';
import matter, { GrayMatterFile } from 'gray-matter';
import { Calendar, DateInput } from 'fullcalendar';
import { CalendarView } from 'main';

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
    calendarTags: {tagName: string, tagColor: string}[] = [];
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
        console.log("localCalendarFiles(): before filter: ", markdownFiles);
        for (const file of markdownFiles) {
            const content = await this.app.vault.read(file);
            if (this.hasCalendarTags(content)) {
                tempCalendarFiles.push(file);
            }
        }
        this.calendarFiles = tempCalendarFiles; 
        this.updateView();
        console.log("localCalendarFiles(): after filter: ", this.calendarFiles);
    }

    async moveCalendarFile(file: TFile, oldPath: string) {
        console.log(file);
        console.log(this.calendarFiles);
    }

    async moveEvent(event: { title: string, start: string, end?: string, id: string}) {
        console.log("moveEvent(): made it here!", event, event.id);

        const file = this.app.vault.getAbstractFileByPath(event.id) as TFile;
        if (!file) {
            console.error(`File not found: ${event.id}`);
            return;
        }

        const content = await this.app.vault.read(file);
        const fileData = this.getFrontmatter(content);

        fileData.data['start-date'] = this.formatDate(event.start);
        if (event.end) {
            const endDate = new Date(event.end);
            endDate.setDate(endDate.getDate() - 1); // re-de-increment the end date by 1
            fileData.data['end-date'] = this.formatDate(endDate);
        } else {
            delete fileData.data['end-date'];
        }

        const updatedContent = matter.stringify(fileData.content, fileData.data);

        await this.app.vault.modify(file, updatedContent);

        console.log("moveEvent(): Updated file metadata", file.path);
    }

    async updateView() {
        console.log("updateView(): updating view");
        if (!this.updating){
            this.updating = true;
            await this.calendarView.calendarReady;
            this.calendarView.calendar.removeAllEvents();
            for (const file of this.calendarFiles) {
                console.log("updateView(): ", file);
                const startDate = this.formatStartDateString(this.getFrontmatter(await this.app.vault.read(file)).data['start-date']);
                const endDate = this.formatEndDateString(this.getFrontmatter(await this.app.vault.read(file)).data['end-date']);
                const backgroundColor = await this.getTagColor(file);
                await this.calendarView.calendarReady;
                if (endDate && startDate){
                    console.log("updateView(): ", {title: file.basename, start: startDate, end: endDate, id: file.path, backgroundColor});
                    this.calendarView.calendar.addEvent({title: file.basename, start: startDate, end: endDate, id: file.path, backgroundColor});
                } else if (startDate) {
                    console.log("updateView(): ", {title: file.basename, start: startDate, id: file.path, backgroundColor});
                    this.calendarView.calendar.addEvent({title: file.basename, start: startDate, id: file.path, backgroundColor});
                }
            }
            console.log("updateView(): updated view");
            this.updating = false;
        }
    }

    async createEvent(title: string, startDate: string, tags: string[], endDate?: string) {
        // Create frontmatter data for the new event
        const frontmatterData: any = {
            title: title,
            'start-date': this.formatDate(startDate),
            tags: tags
        };
    
        // Add 'end-date' to frontmatter only if it is defined
        if (endDate) {
            frontmatterData['end-date'] = this.formatDate(endDate);
        }
    
        // Convert frontmatter data to markdown format
        const content = matter.stringify('', frontmatterData);
    
        // Generate a new file path (you may want to customize the naming convention)
        const newPath = `/${title}.md`;
    
        // Create the new event file in the vault
        const file = await this.app.vault.create(newPath, content);
    
        // Add the new event to the calendar view
        await this.addEventToView(file);
    
        console.log("createEvent(): Created new event", file.path);
    }

    
    async addEventToView(file: TFile) {
        console.log("addEventToView(): updating view");
        if (!this.updating){
            this.updating = true;
            await this.calendarView.calendarReady;
            console.log("addEventToView(): ", file);
            const startDate = this.formatStartDateString(this.getFrontmatter(await this.app.vault.read(file)).data['start-date']);
            const endDate = this.formatEndDateString(this.getFrontmatter(await this.app.vault.read(file)).data['end-date']);
            const backgroundColor = await this.getTagColor(file);
            await this.calendarView.calendarReady;
            if (endDate && startDate){
                console.log("addEventToView(): ", {title: file.basename, start: startDate, end: endDate, id: file.path, backgroundColor: backgroundColor});
                this.calendarView.calendar.addEvent({title: file.basename, start: startDate, end: endDate, id: file.path, backgroundColor: backgroundColor});
            } else if (startDate) {
                console.log("addEventToView(): ", {title: file.basename, start: startDate, id: file.path, backgroundColor: backgroundColor});
                this.calendarView.calendar.addEvent({title: file.basename, start: startDate, id: file.path, backgroundColor: backgroundColor});
            }
            console.log("addEventToView(): updated view");
            this.updating = false;
        }
    }

    async getTagColor(file: TFile): Promise<string> {
        const content = this.getFrontmatter(await this.app.vault.read(file)).data;
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

        // Extract components
        const [year, month, day] = dateString.split('-').map(Number);
        
        // Check if components match the date object
        return (
            date.getFullYear() === year &&
            date.getMonth() === month && 
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

    formatStartDateString(date: Date) {
        const d = new Date(date);
    
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0'); // months are 0-based, so add 1
        const day = String(d.getDate() + 1).padStart(2, '0');
        
        if (!year || !month || !day || !d) {
            return false;
        }
        return `${year}-${month}-${day}`;
    }

    formatEndDateString(date: string) {
        const d = new Date(date);
    
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0'); // months are 0-based, so add 1
        const day = String(d.getDate() + 1).padStart(2, '0');
        const bestDay = String(d.getDate() + 2).padStart(2, '0'); // for some reason fullcalendar displays the end date 1 before the actual date, so have to do this :(

        if (!year || !month || !day || !d) {
            return false;
        }

        if (!bestDay) {
            return `${year}-${month}-01`;
        }

        return `${year}-${month}-${bestDay}`;
    }

    getFrontmatter(content: string): GrayMatterFile<any> {
        const fileData = matter(content);
        return fileData;
    }

    hasCalendarTags(content: string): boolean {
        const tags = this.getFrontmatter(content).data.tags;
        if (tags && Array.isArray(tags)) {
            return this.calendarTags.map(tag => tag.tagName).some(tag => tags.includes(tag));
        }
        return false;
    }

    setCalendarTags(tags: {tagName: string, tagColor: string}[]) {
        this.calendarTags = tags;
        this.loadCalendarFiles();
        console.log('Setted tags to include:', this.calendarTags);
    }

    getCalendarFiles(): TFile[] {
        return this.calendarFiles;
    }
}

export default EventStore;
