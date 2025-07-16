document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    function getCurrentTime() {
        const now = new Date();
        // This logic can be simplified if you don't need a fixed timezone.
        // For simplicity, we'll use the user's local time.
        return now;
    }

    const state = {
        view: 'week', // 'week', 'month', 'year'
        displayDate: getCurrentTime(),
        events: [], // Central data store for events (with absolute dates)
        categories: [] // Central data store for categories
    };
    
    // Global state for operations
    let resizeState = {};
    let activeEventId = null;

    // --- DOM Elements ---
    const calendar = document.getElementById('calendar');
    const timeLine = document.getElementById('time-line');
    const todayBtn = document.getElementById('todayBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const currentDateDisplay = document.getElementById('currentDateDisplay');
    const weekViewBtn = document.getElementById('weekViewBtn');
    const monthViewBtn = document.getElementById('monthViewBtn');
    const yearViewBtn = document.getElementById('yearViewBtn');
    const newCategoryName = document.getElementById('newCategoryName');
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    const taskGroupsContainer = document.getElementById('task-groups-container');
    
    // Modal Elements
    const accomplishmentModal = document.getElementById('accomplishmentModal');
    const modalTaskName = document.getElementById('modalTaskName');
    const accomplishmentList = document.getElementById('accomplishmentList');
    const newAccomplishmentInput = document.getElementById('newAccomplishmentInput');
    const addAccomplishmentBtn = document.getElementById('addAccomplishmentBtn');
    const modalCloseBtn = document.querySelector('.close-btn');
    const deleteTaskBtn = document.getElementById('deleteTaskBtn');
    const confirmDeleteContainer = document.getElementById('confirmDeleteContainer');
    const confirmDeleteYesBtn = document.getElementById('confirmDeleteYesBtn');
    const confirmDeleteNoBtn = document.getElementById('confirmDeleteNoBtn');
    
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthsOfYear = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthsOfYearAbbr = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // --- DATE/GRID CONVERSION HELPERS ---
    function getStartOfWeek(refDate) {
        const start = new Date(refDate);
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - start.getDay());
        return start;
    }

    function gridToDate(row, col, refDate) {
        const startOfWeek = getStartOfWeek(refDate);
        const dayOffset = parseInt(col) - 2;
        const eventDate = new Date(startOfWeek);
        eventDate.setDate(eventDate.getDate() + dayOffset);
        const minutesOffset = (parseInt(row) - 2) * 30;
        eventDate.setMinutes(eventDate.getMinutes() + minutesOffset);
        return eventDate;
    }

    function dateToGrid(date, refDate) {
        const startOfWeek = getStartOfWeek(refDate);
        const dayDiff = Math.floor((date - startOfWeek) / (24 * 60 * 60 * 1000));
        const gridColumn = dayDiff + 2;
        const minutesOfDay = date.getHours() * 60 + date.getMinutes();
        const gridRowStart = Math.floor(minutesOfDay / 30) + 2;
        return { gridRowStart, gridColumn };
    }

    // --- DATA PERSISTENCE (SAVE/LOAD) ---

    function getElectronAPI() {
        return window.electronAPI || (window.parent && window.parent.electronAPI);
    }

    /**
     * Saves the current state (events and categories) and the human-readable history file.
     * This function is called whenever a change is made.
     */
    function saveStateAndHistory() {
        // Prepare a clean state object for saving (omitting transient view properties)
        const appState = {
            events: state.events,
            categories: state.categories,
        };

        const api = getElectronAPI();
        if (api) {
            // Save the application state for reloading
            api.saveState(appState);

            // Generate and save the human-readable markdown file
            const markdownContent = generateHistoryMarkdown();
            api.saveHistory(markdownContent);
        } else {
            console.warn('Electron API not found. Data will not be saved.');
        }
    }

    /**
     * Loads the application state from 'calendar-data.json' on startup.
     */
    async function loadState() {
        const api = getElectronAPI();
        if (api) {
            const loadedState = await api.loadState();
            if (loadedState) {
                state.events = loadedState.events || [];
                state.categories = loadedState.categories || [];
                // Backward compatibility: compute start time if missing
                state.events.forEach(ev => {
                    if (!ev.start && ev.gridRowStart && ev.gridColumn) {
                        const dt = gridToDate(ev.gridRowStart, ev.gridColumn, state.displayDate);
                        ev.start = dt.getTime();
                    }
                });
            }
        }
        
        // If there's no saved data or file doesn't exist, use defaults
        if (state.categories.length === 0) {
            addInitialCategories();
        } else {
            // Re-render categories from the loaded state
            taskGroupsContainer.innerHTML = '';
            state.categories.forEach(cat => createCategoryElement(cat.name, cat.color));
        }
    }

    // --- MAIN RENDER FUNCTION ---
    function render() {
        calendar.innerHTML = ''; // Clear previous view
        timeLine.style.display = 'none'; // Hide by default
        calendar.className = `calendar ${state.view}-view`;

        updateHeader();
        
        switch (state.view) {
            case 'week':
                renderWeekView();
                renderWeekViewEvents();
                calendar.appendChild(timeLine);
                break;
            case 'month':
                renderMonthView();
                break;
            case 'year':
                renderYearView();
                break;
        }
        updateTimeLine();
    }

    function updateHeader() {
        [weekViewBtn, monthViewBtn, yearViewBtn].forEach(btn => btn.classList.remove('active'));
        document.getElementById(`${state.view}ViewBtn`).classList.add('active');

        if (state.view === 'week') {
            const startOfWeek = new Date(state.displayDate);
            startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(endOfWeek.getDate() + 6);
            
            const startMonth = monthsOfYearAbbr[startOfWeek.getMonth()];
            const endMonth = monthsOfYearAbbr[endOfWeek.getMonth()];

            if (startOfWeek.getFullYear() !== endOfWeek.getFullYear()) {
                currentDateDisplay.textContent = `${startMonth} ${startOfWeek.getDate()}, ${startOfWeek.getFullYear()} - ${endMonth} ${endOfWeek.getDate()}, ${endOfWeek.getFullYear()}`;
            } else if (startMonth === endMonth) {
                currentDateDisplay.textContent = `${startMonth} ${startOfWeek.getDate()} - ${endOfWeek.getDate()}, ${endOfWeek.getFullYear()}`;
            } else {
                 currentDateDisplay.textContent = `${startMonth} ${startOfWeek.getDate()} - ${endMonth} ${endOfWeek.getDate()}, ${endOfWeek.getFullYear()}`;
            }

        } else if (state.view === 'month') {
            currentDateDisplay.textContent = `${monthsOfYear[state.displayDate.getMonth()]} ${state.displayDate.getFullYear()}`;
        } else if (state.view === 'year') {
            currentDateDisplay.textContent = state.displayDate.getFullYear();
        }
    }

    // --- VIEW-SPECIFIC RENDERERS ---

    function renderYearView() {
        calendar.innerHTML = `<div style="padding: 20px; text-align: center;">Year View Coming Soon!</div>`;
    }

    function renderMonthView() {
        const year = state.displayDate.getFullYear();
        const month = state.displayDate.getMonth();

        daysOfWeek.forEach(day => {
            const dayHeader = document.createElement('div');
            dayHeader.className = 'day-header';
            dayHeader.textContent = day;
            calendar.appendChild(dayHeader);
        });

        const firstDayOfMonth = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startDayIndex = firstDayOfMonth.getDay();

        const prevMonthDays = new Date(year, month, 0).getDate();
        for (let i = startDayIndex - 1; i >= 0; i--) {
             const cell = createMonthCell(new Date(year, month - 1, prevMonthDays - i), true);
             calendar.appendChild(cell);
        }
        
        for (let day = 1; day <= daysInMonth; day++) {
             const cell = createMonthCell(new Date(year, month, day));
             calendar.appendChild(cell);
        }
        
        const totalCells = 42;
        const filledCells = startDayIndex + daysInMonth;
        for (let day = 1; day <= totalCells - filledCells; day++) {
            const cell = createMonthCell(new Date(year, month + 1, day), true);
            calendar.appendChild(cell);
        }
    }

    function createMonthCell(date, isOtherMonth = false) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        if (isOtherMonth) cell.classList.add('other-month');

        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = date.getDate();
        
        if (date.toDateString() === getCurrentTime().toDateString()) {
             dayNumber.classList.add('today');
        }

        cell.appendChild(dayNumber);
        cell.addEventListener('dragover', handleDragOver);
        cell.addEventListener('dragleave', handleDragLeave);
        cell.addEventListener('drop', handleDropOnCalendar);

        return cell;
    }

    function renderWeekView() {
        const startOfWeek = new Date(state.displayDate);
        startOfWeek.setDate(startOfWeek.getDate() - state.displayDate.getDay());
        
        const headerContainer = document.createElement('div');
        headerContainer.className = 'week-view-header-container';
        
        const cornerCell = document.createElement('div');
        cornerCell.className = 'day-header';
        cornerCell.style.gridRow = '1';
        cornerCell.style.gridColumn = '1';
        headerContainer.appendChild(cornerCell);

        for(let i = 0; i < 7; i++) {
          const currentDay = new Date(startOfWeek);
          currentDay.setDate(startOfWeek.getDate() + i); 
          
          const div = document.createElement('div');
          div.className = 'day-header';
          
          const dayNameSpan = document.createElement('span');
          dayNameSpan.textContent = daysOfWeek[i];
          
          const dayNumberSpan = document.createElement('span');
          dayNumberSpan.className = 'day-number';
          dayNumberSpan.textContent = currentDay.getDate();
          
          if (currentDay.toDateString() === getCurrentTime().toDateString()) {
                dayNumberSpan.classList.add('today');
          }

          div.appendChild(dayNameSpan);
          div.appendChild(dayNumberSpan);

          div.style.gridRow = '1';
          div.style.gridColumn = i + 2;
          headerContainer.appendChild(div);
        }
        calendar.appendChild(headerContainer);

        for (let hour = 0; hour < 24; hour++) {
          const timeDiv = document.createElement('div');
          timeDiv.className = 'time-label';
          timeDiv.style.gridRow = (hour * 2) + 2; 
          timeDiv.style.gridColumn = 1;
          timeDiv.textContent = `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? 'AM' : 'PM'}`;
          calendar.appendChild(timeDiv);

          for (let col = 0; col < 7; col++) {
            const topHalfCell = document.createElement('div');
            topHalfCell.className = 'grid-cell';
            const bottomHalfCell = document.createElement('div');
            bottomHalfCell.className = 'grid-cell grid-cell-bottom-half';

            [topHalfCell, bottomHalfCell].forEach((cell, index) => {
                const cellDate = new Date(startOfWeek);
                cellDate.setDate(cellDate.getDate() + col);
                if(cellDate.toDateString() === getCurrentTime().toDateString()) {
                     cell.classList.add('today-column');
                }
                
                cell.dataset.day = col;
                cell.dataset.hour = hour;
                cell.dataset.minute = index * 30;
                // Important: Set explicit grid positions for drop logic
                cell.style.gridRow = (hour * 2) + 2 + index;
                cell.style.gridColumn = col + 2;

                cell.addEventListener('dragover', handleDragOver);
                cell.addEventListener('dragleave', handleDragLeave);
                cell.addEventListener('drop', handleDropOnCalendar);
                calendar.appendChild(cell);
            });
          }
        }
    }
    
    function renderWeekViewEvents() {
        const weekStart = getStartOfWeek(state.displayDate);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        state.events.filter(ev => {
            const d = new Date(ev.start);
            return d >= weekStart && d < weekEnd;
        }).forEach(eventData => {
            const pos = dateToGrid(new Date(eventData.start), state.displayDate);
            eventData.gridRowStart = pos.gridRowStart;
            eventData.gridColumn = pos.gridColumn;
            const eventEl = document.createElement('div');
            eventEl.id = eventData.id;
            eventEl.className = 'event';
            eventEl.textContent = eventData.text;
            eventEl.style.backgroundColor = eventData.color;

            eventEl.style.gridRowStart = eventData.gridRowStart;
            eventEl.style.gridRowEnd = `span ${eventData.rowSpan}`;
            eventEl.style.gridColumn = eventData.gridColumn;

            makeEventInteractive(eventEl);
            updateAccomplishmentStar(eventEl);
            calendar.appendChild(eventEl);
        });
    }
    
    function updateTimeLine() {
        if (state.view !== 'week') {
            timeLine.style.display = 'none';
            return;
        }
        
        const now = getCurrentTime();

        const startOfWeek = new Date(state.displayDate);
        startOfWeek.setHours(0,0,0,0);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 7);

        if (now < startOfWeek || now >= endOfWeek) {
            timeLine.style.display = 'none';
            return;
        }

        const hour = now.getHours();
        const minutes = now.getMinutes();
        const day = now.getDay();
        const rowHeight = 15; // Corresponds to grid-auto-rows: 15px

        const headerEl = calendar.querySelector('.day-header');
        if (!headerEl) { return; }
        const headerHeight = headerEl.offsetHeight;
        
        // Calculate position based on half-hour rows
        const topPosition = headerHeight + ((hour * 2) + (minutes / 30)) * rowHeight;
        
        // Find the correct column to position the line
        const column = calendar.querySelector(`.grid-cell[data-day='${day}']`);
        if (column) {
            timeLine.style.top = `${topPosition}px`;
            timeLine.style.left = `${column.offsetLeft}px`;
            timeLine.style.width = `${column.offsetWidth}px`;
            timeLine.style.display = 'block';
        } else {
            timeLine.style.display = 'none';
        }
    }

    // --- SIDEBAR & TASKS ---

    function getRandomColor() {
      const colors = ['#f28b82', '#fbbc04', '#fff475', '#ccff90', '#a7ffeb', '#cbf0f8', '#aecbfa', '#d7aefb', '#fdcfe8', '#e6c9a8'];
      // Avoid returning a color that's too light for white
      return colors[Math.floor(Math.random() * colors.length)];
    }

    function createCategoryElement(name, color) {
        const taskGroup = document.createElement('div');
        taskGroup.className = 'task-group';
        const taskHeader = document.createElement('div');
        taskHeader.className = 'task-header';
        const taskHeaderTitle = document.createElement('div');
        taskHeaderTitle.className = 'task-header-title';
        const colorIndicator = document.createElement('div');
        colorIndicator.className = 'color-indicator';
        colorIndicator.style.backgroundColor = color;
        const titleSpan = document.createElement('span');
        titleSpan.textContent = name;
        taskHeaderTitle.appendChild(colorIndicator);
        taskHeaderTitle.appendChild(titleSpan);
        const addTaskHeaderBtn = document.createElement('button');
        addTaskHeaderBtn.className = 'add-task-header-btn';
        addTaskHeaderBtn.innerHTML = '+';
        addTaskHeaderBtn.title = 'Add new task';
        taskHeader.appendChild(taskHeaderTitle);
        taskHeader.appendChild(addTaskHeaderBtn);
        const taskItems = document.createElement('div');
        taskItems.className = 'task-items';
        const newTaskInputDiv = document.createElement('div');
        newTaskInputDiv.className = 'new-task-input-in-group';
        const newTaskInput = document.createElement('input');
        newTaskInput.type = 'text';
        newTaskInput.placeholder = 'New Task...';
        const newTaskButton = document.createElement('button');
        newTaskButton.textContent = '+';
        newTaskInputDiv.appendChild(newTaskInput);
        newTaskInputDiv.appendChild(newTaskButton);
        taskGroup.appendChild(taskHeader);
        taskGroup.appendChild(taskItems);
        taskGroup.appendChild(newTaskInputDiv);
        
        taskHeader.addEventListener('click', () => taskItems.classList.toggle('show'));
        addTaskHeaderBtn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            taskItems.classList.add('show');
            newTaskInputDiv.classList.toggle('show');
            newTaskInput.focus();
        });
        
        newTaskButton.addEventListener('click', () => {
            const taskName = newTaskInput.value.trim();
            if (taskName) {
                const taskEl = document.createElement('div');
                const taskId = `task-${crypto.randomUUID()}`;
                taskEl.id = taskId;
                taskEl.className = 'draggable';
                taskEl.textContent = taskName;
                taskEl.style.backgroundColor = color;
                taskEl.draggable = true;
                
                taskEl.addEventListener('dragstart', (e) => {
                    const taskData = { type: 'newTask', id: taskId, text: taskName, color: color };
                    e.dataTransfer.setData('application/json', JSON.stringify(taskData));
                    e.dataTransfer.effectAllowed = 'move';
                    setTimeout(() => taskEl.classList.add('dragging'), 0);
                });

                taskEl.addEventListener('dragend', () => taskEl.classList.remove('dragging'));
                taskItems.appendChild(taskEl);
                newTaskInput.value = '';
            }
        });

        newTaskInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') newTaskButton.click();
        });

        taskGroupsContainer.appendChild(taskGroup);
    }

    function handleAddCategory() {
        const name = newCategoryName.value.trim();
        if (name && !state.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            const newCategory = { name: name, color: getRandomColor() };
            state.categories.push(newCategory);
            createCategoryElement(newCategory.name, newCategory.color);
            newCategoryName.value = '';
            saveStateAndHistory(); // SAVE
        }
    }

    function addInitialCategories() {
        const initial = [
            { name: 'Work', color: '#aecbfa' },
            { name: 'Personal', color: '#f28b82' }
        ];
        initial.forEach(cat => {
            if (!state.categories.some(c => c.name === cat.name)) {
                state.categories.push(cat);
                createCategoryElement(cat.name, cat.color);
            }
        });
        saveStateAndHistory(); // Initial save
    }

    // --- DRAG & DROP & RESIZE HANDLERS ---
    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this.classList.add('drag-over');
    }

    function handleDragLeave() {
        this.classList.remove('drag-over');
    }

    function handleDropOnCalendar(e) {
        e.preventDefault();
        this.classList.remove('drag-over');

        const dataString = e.dataTransfer.getData('application/json');
        if (!dataString) return;

        const data = JSON.parse(dataString);
        const targetCell = e.currentTarget;
        const targetGridRow = parseInt(targetCell.style.gridRow);
        const targetGridCol = parseInt(targetCell.style.gridColumn);
        const newStart = gridToDate(targetGridRow, targetGridCol, state.displayDate).getTime();

        if (data.type === 'existingEvent') {
            const eventData = state.events.find(ev => ev.id === data.id);
            if (eventData) {
                eventData.gridRowStart = targetGridRow;
                eventData.gridColumn = targetGridCol;
                eventData.start = newStart;
            }
        } else if (data.type === 'newTask') {
            const newEventData = {
                id: `event-${crypto.randomUUID()}`,
                text: data.text,
                color: data.color,
                gridRowStart: targetGridRow,
                gridColumn: targetGridCol,
                start: newStart,
                rowSpan: 2, // Default 1-hour duration (2 * 30min slots)
                accomplishments: []
            };
            state.events.push(newEventData);
            
            const originalTask = document.getElementById(data.id);
            if (originalTask) originalTask.remove();
        }
        
        saveStateAndHistory(); // SAVE
        render(); // Re-render the whole view to correctly place the event
    }
    
    function makeEventInteractive(eventEl) {
        eventEl.draggable = true;
        
        eventEl.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            const eventData = { type: 'existingEvent', id: eventEl.id };
            e.dataTransfer.setData('application/json', JSON.stringify(eventData));
            setTimeout(() => eventEl.classList.add('dragging'), 0);
        });
        
        eventEl.addEventListener('dragend', (e) => eventEl.classList.remove('dragging'));
        eventEl.addEventListener('dblclick', openAccomplishmentModal);

        addResizersToEvent(eventEl);
    }
    
    function addResizersToEvent(eventEl) {
        const topResizer = document.createElement('div');
        topResizer.className = 'resizer top';
        const bottomResizer = document.createElement('div');
        bottomResizer.className = 'resizer bottom';
        
        eventEl.appendChild(topResizer);
        eventEl.appendChild(bottomResizer);
        
        topResizer.addEventListener('mousedown', initResize);
        bottomResizer.addEventListener('mousedown', initResize);
    }
    
    function initResize(e) {
        e.preventDefault();
        e.stopPropagation();

        resizeState.eventEl = e.target.parentElement;
        const style = window.getComputedStyle(resizeState.eventEl);
        resizeState.isTopResizer = e.target.classList.contains('top');
        resizeState.startY = e.clientY;
        resizeState.initialRowStart = parseInt(style.gridRowStart);
        const rowEnd = style.gridRowEnd;
        resizeState.initialRowSpan = rowEnd.includes('span') ? parseInt(rowEnd.split(' ')[1]) : 1;
        
        document.addEventListener('mousemove', resizeEvent);
        document.addEventListener('mouseup', stopResize);
    }

    function resizeEvent(e) {
        if (!resizeState.eventEl) return;

        const deltaY = e.clientY - resizeState.startY;
        const snapGridSize = 15; // Corresponds to grid-auto-rows
        const deltaRows = Math.round(deltaY / snapGridSize);

        if (resizeState.isTopResizer) {
            let newRowStart = resizeState.initialRowStart + deltaRows;
            let newRowSpan = resizeState.initialRowSpan - deltaRows;
            
            if (newRowStart < 2) { // Cannot go above the header
                newRowSpan += newRowStart - 2;
                newRowStart = 2;
            }
            if (newRowSpan < 1) newRowSpan = 1; // Minimum height of one slot
            
            resizeState.eventEl.style.gridRowStart = newRowStart;
            resizeState.eventEl.style.gridRowEnd = `span ${newRowSpan}`;

        } else { // Bottom resizer
            let newRowSpan = resizeState.initialRowSpan + deltaRows;
            
            // Grid has 24 hours * 2 slots/hr + 1 header row = 49 rows total.
            if (resizeState.initialRowStart + newRowSpan > 50) {
                newRowSpan = 50 - resizeState.initialRowStart;
            }
             if (newRowSpan < 1) newRowSpan = 1;

            resizeState.eventEl.style.gridRowEnd = `span ${newRowSpan}`;
        }
    }
    
    function stopResize() {
        if (!resizeState.eventEl) return;

        const eventData = state.events.find(ev => ev.id === resizeState.eventEl.id);
        const style = window.getComputedStyle(resizeState.eventEl);

        if (eventData) {
            eventData.gridRowStart = parseInt(style.gridRowStart);
            const rowEnd = style.gridRowEnd;
            eventData.rowSpan = rowEnd.includes('span') ? parseInt(rowEnd.split(' ')[1]) : 1;
            eventData.start = gridToDate(eventData.gridRowStart, eventData.gridColumn, state.displayDate).getTime();
            saveStateAndHistory(); // SAVE
        }

        document.removeEventListener('mousemove', resizeEvent);
        document.removeEventListener('mouseup', stopResize);
        resizeState = {};
    }

    // --- ACCOMPLISHMENT MODAL ---
    function openAccomplishmentModal(e) {
        e.stopPropagation();
        const eventEl = e.currentTarget;
        activeEventId = eventEl.id;

        const eventData = state.events.find(ev => ev.id === activeEventId);
        if (!eventData) return;

        modalTaskName.textContent = eventData.text;
        renderAccomplishmentList(eventData.accomplishments);
        accomplishmentModal.style.display = 'block';
    }
    
    function closeAccomplishmentModal() {
        accomplishmentModal.style.display = 'none';
        activeEventId = null;
        cancelDeleteConfirmation();
    }
    
    function renderAccomplishmentList(accomplishments) {
        accomplishmentList.innerHTML = '';
        accomplishments.forEach((item, index) => {
            const li = document.createElement('li');
            li.textContent = item;
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-accomplishment-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.onclick = () => handleDeleteAccomplishment(index);
            
            li.appendChild(deleteBtn);
            accomplishmentList.appendChild(li);
        });
    }

    function handleAddAccomplishment() {
        const text = newAccomplishmentInput.value.trim();
        if (text && activeEventId) {
            const eventData = state.events.find(ev => ev.id === activeEventId);
            if (eventData) {
                eventData.accomplishments.push(text);
                renderAccomplishmentList(eventData.accomplishments);
                updateAccomplishmentStar(document.getElementById(activeEventId));
                newAccomplishmentInput.value = '';
                saveStateAndHistory(); // SAVE
            }
        }
    }

    function handleDeleteAccomplishment(index) {
        if (activeEventId) {
            const eventData = state.events.find(ev => ev.id === activeEventId);
            if (eventData) {
                eventData.accomplishments.splice(index, 1);
                renderAccomplishmentList(eventData.accomplishments);
                updateAccomplishmentStar(document.getElementById(activeEventId));
                saveStateAndHistory(); // SAVE
            }
        }
    }
    
    function showDeleteConfirmation() {
        deleteTaskBtn.style.display = 'none';
        confirmDeleteContainer.style.display = 'inline-block';
    }

    function cancelDeleteConfirmation() {
        deleteTaskBtn.style.display = 'inline-block';
        confirmDeleteContainer.style.display = 'none';
    }

    function executeDeleteTask() {
        if (!activeEventId) return;
        
        // Remove from state
        state.events = state.events.filter(ev => ev.id !== activeEventId);
        
        // Remove from DOM
        const eventEl = document.getElementById(activeEventId);
        if (eventEl) eventEl.remove();

        saveStateAndHistory(); // SAVE
        closeAccomplishmentModal();
    }
    
    function updateAccomplishmentStar(eventEl) {
        if (!eventEl) return;
        
        const eventData = state.events.find(ev => ev.id === eventEl.id);
        let badge = eventEl.querySelector('.accomplishment-badge');
        
        if (eventData && eventData.accomplishments.length > 0) {
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'accomplishment-badge';
                eventEl.appendChild(badge);
            }
            badge.innerHTML = `<span class="star">⭐</span> ${eventData.accomplishments.length}`;
        } else {
            if (badge) badge.remove();
        }
    }

    // --- HISTORY FILE GENERATION ---
    function getEventStartDate(eventData) {
        return new Date(eventData.start);
    }

    function getEventDateTimeString(eventData) {
        const startDate = getEventStartDate(eventData);
        return startDate.toLocaleString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true
        });
    }

    function getEventDateTimeRangeString(eventData) {
        const startDate = getEventStartDate(eventData);
        const durationMinutes = (parseInt(eventData.rowSpan) || 1) * 30;
        const endDate = new Date(startDate.getTime() + durationMinutes * 60000);

        const startStr = startDate.toLocaleString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true
        });

        const endStr = startDate.toDateString() === endDate.toDateString()
            ? endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            : endDate.toLocaleString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit', hour12: true
            });

        return `${startStr} - ${endStr}`;
    }

    function generateHistoryMarkdown() {
        if (state.events.length === 0) {
            return "No events on the calendar yet.";
        }

        let markdownString = "# Calendar History\n\n";
        markdownString += "| Date/Time | Task Label | Number of Accomplishments | Accomplishment Labels |\n";
        markdownString += "| :--- | :--- | :--- | :--- |\n";

        // Sort events by date before generating the table
        const sortedEvents = [...state.events].sort((a, b) => {
            const dateA = getEventStartDate(a);
            const dateB = getEventStartDate(b);
            return dateA - dateB;
        });

        sortedEvents.forEach(event => {
            const dateTime = getEventDateTimeRangeString(event);
            const taskLabel = event.text.replace(/\|/g, '\\|'); // Escape pipe characters
            const accomplishmentCount = event.accomplishments.length;
            const accomplishmentDetails = event.accomplishments.length > 0 
                ? event.accomplishments.map(acc => `- ${acc.replace(/\|/g, '\\|').replace(/\n/g, ' ')}`).join('<br>')
                : 'N/A';
            
            markdownString += `| ${dateTime} | ${taskLabel} | ${accomplishmentCount} | ${accomplishmentDetails} |\n`;
        });
        
        return markdownString;
    }

    // --- EVENT HANDLERS ---
    function setupEventListeners() {
        todayBtn.addEventListener('click', () => { state.displayDate = getCurrentTime(); render(); });
        prevBtn.addEventListener('click', () => navigate(-1));
        nextBtn.addEventListener('click', () => navigate(1));
        weekViewBtn.addEventListener('click', () => switchView('week'));
        monthViewBtn.addEventListener('click', () => switchView('month'));
        yearViewBtn.addEventListener('click', () => switchView('year'));
        addCategoryBtn.addEventListener('click', handleAddCategory);
        newCategoryName.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAddCategory(); });
        window.addEventListener('resize', updateTimeLine);
        
        // Modal listeners
        modalCloseBtn.addEventListener('click', closeAccomplishmentModal);
        addAccomplishmentBtn.addEventListener('click', handleAddAccomplishment);
        newAccomplishmentInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAddAccomplishment(); });
        deleteTaskBtn.addEventListener('click', showDeleteConfirmation);
        confirmDeleteYesBtn.addEventListener('click', executeDeleteTask);
        confirmDeleteNoBtn.addEventListener('click', cancelDeleteConfirmation);
    }

    function navigate(direction) {
        if (state.view === 'week') {
            state.displayDate.setDate(state.displayDate.getDate() + (7 * direction));
        } else if (state.view === 'month') {
            state.displayDate.setMonth(state.displayDate.getMonth() + direction);
        } else if (state.view === 'year') {
            state.displayDate.setFullYear(state.displayDate.getFullYear() + direction);
        }
        render();
    }

    function switchView(viewName) {
        if (state.view !== viewName) {
            state.view = viewName;
            render();
        }
    }

    // --- INITIALIZATION ---
    async function init() {
        // Asynchronously load saved data first
        await loadState();
        
        // Then set up the application
        setupEventListeners();
        render(); // Initial render with potentially loaded data
        setInterval(updateTimeLine, 60000); 
    }

    init();
});
