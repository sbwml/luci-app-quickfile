const uploadManager = document.getElementById('upload-manager');
const uploadManagerList = document.getElementById('upload-manager-list');
const uploadManagerSummary = document.getElementById('upload-manager-summary');

function T(key, data = {}) {
    let val = (window.I18N && window.I18N[key]) || key;
    for (let k in data) {
        val = val.replace(`{${k}}`, data[k]);
    }
    return val;
}

function showUploadManager() {
    uploadManager.classList.remove('hidden');
    // Default to expanded state
    uploadManager.classList.remove('collapsed');
    uploadManagerList.classList.remove('hidden');
}

function closeUploadManager(event) {
    if (event) event.stopPropagation();
    uploadManager.classList.add('hidden');
}

function toggleUploadManager() {
    const isCollapsed = uploadManager.classList.toggle('collapsed');
    if (isCollapsed) {
        uploadManagerList.classList.add('hidden');
    } else {
        uploadManagerList.classList.remove('hidden');
    }
}

let uploadTasks = {};

function addUploadTask(file) {
    const existingTasks = Object.values(uploadTasks);
    if (existingTasks.length > 0 && existingTasks.every(t => t.progress === 100)) {
        uploadTasks = {};
        uploadManagerList.innerHTML = '';
    }

    const taskId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    uploadTasks[taskId] = { file, progress: 0, status: 'pending' };

    const item = document.createElement('div');
    item.id = taskId;
    item.className = 'upload-item';
    item.innerHTML = `
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="upload-progress">
                        <div class="upload-progress-bar bg-blue-500" style="width: 0%"></div>
                    </div>
                    <div class="flex justify-between text-xs text-gray-500 mt-1">
                        <span class="upload-status">${T('waiting_upload')}</span>
                        <span class="upload-speed"></span>
                    </div>
                </div>
            `;
    uploadManagerList.appendChild(item);
    showUploadManager();
    updateOverallProgress();

    // Auto-collapse if more than 5 tasks
    if (Object.keys(uploadTasks).length > 5) {
        if (!uploadManager.classList.contains('collapsed')) {
            toggleUploadManager();
        }
    }

    return taskId;
}

function updateUploadProgress(taskId, progress, statusText) {
    const task = uploadTasks[taskId];
    if (!task) return;

    task.progress = progress;
    const item = document.getElementById(taskId);
    if (item) {
        const progressBar = item.querySelector('.upload-progress-bar');
        progressBar.style.width = `${progress}%`;
        const statusEl = item.querySelector('.upload-status');
        statusEl.textContent = statusText;
        if (progress === 100) {
            statusEl.classList.add('text-success');
            progressBar.classList.remove('bg-blue-500');
            progressBar.classList.add('bg-green-500');
        } else if (statusText.includes(T('upload_failed')) || statusText.includes(T('error'))) {
            statusEl.classList.add('text-danger');
            progressBar.classList.remove('bg-blue-500');
            progressBar.classList.add('bg-red-500');
        }
    }
    updateOverallProgress();
}

function updateOverallProgress() {
    const tasks = Object.values(uploadTasks);
    if (tasks.length === 0) {
        uploadManagerSummary.textContent = T('no_upload_tasks');
        return;
    }

    const completedCount = tasks.filter(t => t.progress === 100).length;
    uploadManagerSummary.textContent = T('upload_summary', { completed: completedCount, total: tasks.length });

    if (completedCount === tasks.length) {
        uploadManagerSummary.textContent = T('tasks_completed');
        setTimeout(() => {
            if (!uploadManager.classList.contains('collapsed')) {
                toggleUploadManager();
            }
        }, 5000);
    }
}

function cancelUpload(taskId) {
    const task = uploadTasks[taskId];
    if (task && task.xhr) {
        task.xhr.abort();
    }
    const taskElement = document.getElementById(taskId);
    if (taskElement) {
        taskElement.remove();
    }
    delete uploadTasks[taskId];
    updateOverallProgress();
}

function setDarkMode(isDark) {
    const html = document.documentElement;
    const button = document.querySelector('[onclick="toggleDarkMode()"]');
    const icon = button ? button.querySelector('i') : null;
    const span = button ? button.querySelector('span') : null;

    if (isDark) {
        html.classList.add('dark');
        if (icon) {
            icon.classList.remove('fa-regular', 'fa-moon');
            icon.classList.add('fa-regular', 'fa-sun');
        }
        if (span) {
            span.textContent = T('light_mode');
        }
    } else {
        html.classList.remove('dark');
        if (icon) {
            icon.classList.remove('fa-regular', 'fa-sun');
            icon.classList.add('fa-regular', 'fa-moon');
        }
        if (span) {
            span.textContent = T('dark_mode');
        }
    }
}

function toggleDarkMode() {
    const html = document.documentElement;
    const isDarkMode = !html.classList.contains('dark');
    setDarkMode(isDarkMode);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (isDarkMode === prefersDark) {
        localStorage.removeItem('darkMode');
    } else {
        localStorage.setItem('darkMode', isDarkMode);
    }
}

function toggleView() {
    const viewToggleBtn = document.getElementById('view-toggle-btn');
    const icon = viewToggleBtn.querySelector('i');
    const span = viewToggleBtn.querySelector('span');
    const fileArea = document.getElementById('file-area');
    const tableHeader = fileArea.querySelector('table');
    const tableBodyContainer = fileArea.querySelector('.file-area');
    const gridView = document.getElementById('file-grid-view');

    if (currentView === 'list') {
        // Switch to GRID view
        currentView = 'grid';
        localStorage.setItem('view', currentView);
        icon.classList.remove('fa-solid', 'fa-table-cells-large');
        icon.classList.add('fa-solid', 'fa-list');
        span.textContent = T('list_view');
        
        if (tableHeader) tableHeader.style.display = 'none';
        if (tableBodyContainer) tableBodyContainer.style.display = 'none';
        
        gridView.style.display = 'grid';

    } else {
        // Switch to LIST view
        currentView = 'list';
        localStorage.setItem('view', currentView);
        icon.classList.remove('fa-solid', 'fa-list');
        icon.classList.add('fa-solid', 'fa-table-cells-large');
        span.textContent = T('grid_view');

        if (tableHeader) tableHeader.style.display = '';
        if (tableBodyContainer) tableBodyContainer.style.display = '';

        gridView.style.display = 'none';
    }
    refreshList();
}

let currentSortField = localStorage.getItem('sortField') || 'name';
let currentSortOrder = localStorage.getItem('sortOrder') || 'asc';

function handleSort(field) {
    if (currentSortField === field) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortField = field;
        currentSortOrder = 'asc';
    }
    localStorage.setItem('sortField', currentSortField);
    localStorage.setItem('sortOrder', currentSortOrder);
    updateSortUI();
    refreshList();
}

function updateSortUI() {
    const fields = ['name', 'size', 'modtime'];
    fields.forEach(f => {
        const icon = document.getElementById(`sort-icon-${f}`);
        if (!icon) return;
        if (f === currentSortField) {
            icon.className = `fa-solid fa-sort-${currentSortOrder === 'asc' ? 'up' : 'down'} ml-1 text-primary opacity-100`;
        } else {
            icon.className = 'fa-solid fa-sort ml-1 opacity-20 group-hover:opacity-100';
        }
    });
}

let currentView = localStorage.getItem('view') || 'list';
(function () {
    function applyTheme() {
        const savedMode = localStorage.getItem('darkMode');
        if (savedMode !== null) {
            setDarkMode(savedMode === 'true');
        } else {
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            setDarkMode(prefersDark);
        }
    }

    applyTheme();
    applyView();
    updateSortUI();

    function applyView() {
        const viewToggleBtn = document.getElementById('view-toggle-btn');
        if (!viewToggleBtn) return;
        const icon = viewToggleBtn.querySelector('i');
        const span = viewToggleBtn.querySelector('span');
        const fileArea = document.getElementById('file-area');
        const tableHeader = fileArea.querySelector('table');
        const tableBodyContainer = fileArea.querySelector('.file-area');
        const gridView = document.getElementById('file-grid-view');

        if (currentView === 'grid') {
            icon.classList.remove('fa-solid', 'fa-table-cells-large');
            icon.classList.add('fa-solid', 'fa-list');
            span.textContent = T('list_view');
            if (tableHeader) tableHeader.style.display = 'none';
            if (tableBodyContainer) tableBodyContainer.style.display = 'none';
            gridView.style.display = 'grid';
        } else {
            icon.classList.remove('fa-solid', 'fa-list');
            icon.classList.add('fa-solid', 'fa-table-cells-large');
            span.textContent = T('grid_view');
            if (tableHeader) tableHeader.style.display = '';
            if (tableBodyContainer) tableBodyContainer.style.display = '';
            gridView.style.display = 'none';
        }
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (localStorage.getItem('darkMode') === null) {
            setDarkMode(e.matches);
        }
    });
})();

// Marquee Selection Logic
const fileAreaForSelection = document.getElementById('file-area');
const selectionRectangle = document.getElementById('selection-rectangle');
let isSelecting = false;
let startX, startY;
window.hasMarqueeDragged = false;

fileAreaForSelection.addEventListener('mousedown', (e) => {
    window.hasMarqueeDragged = false;
    // Do not start marquee selection on right-click
    if (e.button === 2) {
        return;
    }
    const isInteractive = e.target.closest('button, input');
    if (isInteractive) {
        return; 
    }

    if (currentView === 'grid' && e.target.closest('.file-grid-item')) {
        // If clicking on an item, don't start marquee selection immediately
        // unless clicking the background
    }

    const row = e.target.closest('.file-row-hover, .file-grid-item');
    if (row && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        // Handle in click
    } else if (!row) {
        document.querySelectorAll('.file-row-hover.bg-light, .file-grid-item.selected').forEach(item => {
            item.classList.remove('bg-light', 'selected');
        });
        document.querySelectorAll('.batch-delete-checkbox').forEach(cb => cb.checked = false);
        updateHeaderCheckbox();
    }

    isSelecting = true;
    const rect = fileAreaForSelection.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;

    selectionRectangle.style.left = `${startX}px`;
    selectionRectangle.style.top = `${startY}px`;
    selectionRectangle.style.width = '0px';
    selectionRectangle.style.height = '0px';
    selectionRectangle.style.display = 'block';

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    e.preventDefault(); 
});

function onMouseMove(e) {
    if (!isSelecting) return;

    const rect = fileAreaForSelection.getBoundingClientRect();
    let currentX = e.clientX - rect.left;
    let currentY = e.clientY - rect.top;

    if (Math.abs(currentX - startX) > 3 || Math.abs(currentY - startY) > 3) {
        window.hasMarqueeDragged = true;
    }

    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    const left = Math.min(currentX, startX);
    const top = Math.min(currentY, startY);

    selectionRectangle.style.width = `${width}px`;
    selectionRectangle.style.height = `${height}px`;
    selectionRectangle.style.left = `${left}px`;
    selectionRectangle.style.top = `${top}px`;

    checkSelection();
}

function onMouseUp(e) {
    isSelecting = false;
    selectionRectangle.style.display = 'none';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    setTimeout(() => { window.hasMarqueeDragged = false; }, 50);
}

fileAreaForSelection.addEventListener('click', (e) => {
    if (window.hasMarqueeDragged) {
        e.stopPropagation();
        e.preventDefault();
    }
}, true);


function checkSelection() {
    const selectionRect = selectionRectangle.getBoundingClientRect();
    const items = currentView === 'list' 
        ? document.querySelectorAll('#file-table-body tr') 
        : document.querySelectorAll('.file-grid-item');

    items.forEach(item => {
        const itemRect = item.getBoundingClientRect();
        const isIntersecting = !(selectionRect.right < itemRect.left || 
                                 selectionRect.left > itemRect.right || 
                                 selectionRect.bottom < itemRect.top || 
                                 selectionRect.top > itemRect.bottom);

        const checkbox = item.querySelector('.batch-delete-checkbox');
        if (isIntersecting) {
            if (currentView === 'list') {
                item.classList.add('bg-light');
            } else {
                item.classList.add('selected');
            }
            if (checkbox) checkbox.checked = true;
        } else {
            if (currentView === 'list') {
                item.classList.remove('bg-light');
            } else {
                item.classList.remove('selected');
            }
            if (checkbox) checkbox.checked = false;
        }
    });
    updateHeaderCheckbox();
}
;

function escapeJsString(str) {
    if (!str) return '';
    // Escape for a double-quoted JS string.
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

let curDir = new URLSearchParams(window.location.search).get('path') || '.';
let showHiddenFiles = localStorage.getItem('showHiddenFiles') === 'true';

// Initialize hidden files UI
function updateHiddenFilesUI() {
    const icon = document.getElementById('show-hidden-icon');
    if (icon) {
        if (showHiddenFiles) {
            icon.className = 'fa-solid fa-eye text-primary';
        } else {
            icon.className = 'fa-solid fa-eye-slash';
        }
    }
}

updateHiddenFilesUI();

function toggleHiddenFiles() {
    showHiddenFiles = !showHiddenFiles;
    localStorage.setItem('showHiddenFiles', showHiddenFiles);
    updateHiddenFilesUI();
    refreshList();
}

let mkdirInputRow = null;
let createFileInputRow = null;
let renameInputRow = null;
let renameFileInputRow = null;
let editingFileName = null;
let monacoInstance = null;
let chmodTargetName = null;
let searchKeyword = "";
let clipboardAction = null;
let clipboardFiles = [];
let clipboardDir = null;

const formatSize = s => {
    if (s < 1024) return s + ' B';
    if (s < 1024 * 1024) return (s / 1024).toFixed(2) + ' KB';
    if (s < 1024 * 1024 * 1024) return (s / 1024 / 1024).toFixed(2) + ' MB';
    if (s < 1024 * 1024 * 1024 * 1024) return (s / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    return (s / 1024 / 1024 / 1024 / 1024).toFixed(2) + ' TB';
};

if (window.self !== window.top) {
    document.getElementById('main-container').classList.add('max-w-full');
} else {
    document.getElementById('main-container').classList.add('max-w-7xl');
}

function isImageFile(name) {
    const ext = name.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tif', 'tiff', 'avif'].includes(ext);
}
function isVideoFile(name) {
    const ext = name.split('.').pop().toLowerCase();
    return ['mp4', 'webm', 'ogv', 'mov', 'mkv', 'avi', 'flv', 'wmv', 'm4v', '3gp', 'ts'].includes(ext);
}
function isAudioFile(name) {
    const ext = name.split('.').pop().toLowerCase();
    return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'ape', 'amr'].includes(ext);
}
function isIpkFile(name) {
    return name.toLowerCase().endsWith('.ipk');
}
function isApkFile(name) {
    return name.toLowerCase().endsWith('.apk');
}

function isCompressedFile(name) {
    const ext = name.split('.').pop().toLowerCase();
    return ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'iso'].includes(ext);
}

async function showInstallPackageModal(fileName, type) {
    const title = T("install_package");
    const message = T("install_confirm", { name: fileName, type: type.toUpperCase(), cmd: type === 'ipk' ? 'opkg' : 'apk' });

    const modal = document.getElementById('custom-confirm-modal');
    const okBtn = document.getElementById('custom-confirm-ok');
    const cancelBtn = document.getElementById('custom-confirm-cancel');
    document.getElementById('custom-confirm-title').textContent = title;
    document.getElementById('custom-confirm-message').innerHTML = message;
    okBtn.innerText = T("ok");
    cancelBtn.innerText = T("cancel");
    okBtn.disabled = false;
    cancelBtn.disabled = false;
    modal.classList.remove('hidden');

    let okClicked = false;
    let userChoice = await new Promise(resolve => {
        function okHandler() {
            if (okClicked) return;
            okClicked = true;
            okBtn.disabled = true;
            cancelBtn.disabled = true;
            okBtn.innerText = T("installing_btn");
            resolve(true);
        }
        function cancelHandler() {
            if (okClicked) return;
            okClicked = true;
            resolve(false);
        }
        okBtn.addEventListener('click', okHandler, { once: true });
        cancelBtn.addEventListener('click', cancelHandler, { once: true });
    });

    if (!userChoice) {
        modal.classList.add('hidden');
        okBtn.disabled = false;
        cancelBtn.disabled = false;
        okBtn.innerText = T("ok");
        return;
    }

    async function doInstall() {
        okBtn.disabled = true;
        cancelBtn.disabled = true;
        okBtn.innerText = T("installing_btn");

        let url = type === "ipk" ? window.API_PREFIX + "install_ipk" : window.API_PREFIX + "install_apk";
        const data = new URLSearchParams();
        data.append("dir", curDir);
        data.append("name", fileName);

        let res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: data.toString(),
        });
        let result = await res.json();

        if (result.success) {
            modal.classList.add('hidden');
            okBtn.disabled = false;
            cancelBtn.disabled = false;
            okBtn.innerText = T("ok");
            let msg = `<div class="text-success font-semibold mb-2">${T("install_success")}</div>`;
            msg += `<pre style="white-space:pre-wrap;max-height:320px;overflow:auto;background:#f7f7f7;border-radius:8px;padding:8px;margin:0;text-align:left;">${(result.log || "").replace(/</g, "&lt;")}</pre>`;
            await customAlertModal(msg, T("install_logs"));
            refreshList();
            return;
        } else {
            let msg = `<div class="text-danger font-semibold mb-2">${T("install_failed")}</div>`;
            msg += `<pre style="white-space:pre-wrap;max-height:320px;overflow:auto;background:#f7f7f7;border-radius:8px;padding:8px;margin:0;text-align:left;">${(result.log || "").replace(/</g, "&lt;")}</pre>`;
            msg += `<div class="mt-3">${T("update_source_retry")}</div>`;
            document.getElementById('custom-confirm-message').innerHTML = msg;
            okBtn.innerText = T("update_source_btn");
            cancelBtn.innerText = T("exit");
            okBtn.disabled = false;
            cancelBtn.disabled = false;

            while (true) {
                let retryChoice = await new Promise(resolve => {
                    function okHandler() {
                        okBtn.disabled = true;
                        cancelBtn.disabled = true;
                        okBtn.innerText = T("updating");
                        resolve(true);
                    }
                    function cancelHandler() {
                        resolve(false);
                    }
                    okBtn.onclick = okHandler;
                    cancelBtn.onclick = cancelHandler;
                });

                if (!retryChoice) {
                    modal.classList.add('hidden');
                    okBtn.innerText = T("ok");
                    cancelBtn.innerText = T("cancel");
                    okBtn.disabled = false;
                    cancelBtn.disabled = false;
                    return;
                }

                let updateUrl = type === "ipk" ? window.API_PREFIX + "opkg_update" : window.API_PREFIX + "apk_update";
                let updateRes = await fetch(updateUrl, { method: "POST" });
                let updateData = await updateRes.json();
                let updateMsg = "";
                if (updateData.success) {
                    updateMsg = `<div class="text-success font-semibold mb-2">${T("source_update_success")}</div>`;
                } else {
                    updateMsg = `<div class="text-danger font-semibold mb-2">${T("source_update_failed")}</div>`;
                }
                updateMsg += `<pre style="white-space:pre-wrap;max-height:320px;overflow:auto;background:#f7f7f7;border-radius:8px;padding:8px;margin:0;text-align:left;">${(updateData.log || "").replace(/</g, "&lt;")}</pre>`;
                document.getElementById('custom-confirm-message').innerHTML = updateMsg;
                okBtn.innerText = updateData.success ? T("reinstall") : T("retry_update");
                cancelBtn.innerText = T("exit");
                okBtn.disabled = false;
                cancelBtn.disabled = false;

                if (updateData.success) {
                    let again = await new Promise(resolve => {
                        function okHandler() {
                            okBtn.disabled = true;
                            cancelBtn.disabled = true;
                            okBtn.innerText = T("installing_btn");
                            resolve(true);
                        }
                        function cancelHandler() {
                            resolve(false);
                        }
                        okBtn.onclick = okHandler;
                        cancelBtn.onclick = cancelHandler;
                    });
                    if (again) {
                        return await doInstall();
                    } else {
                        modal.classList.add('hidden');
                        okBtn.innerText = T("ok");
                        cancelBtn.innerText = T("cancel");
                        okBtn.disabled = false;
                        cancelBtn.disabled = false;
                        return;
                    }
                }
            }
        }
    }

    await doInstall();
}

function customAlertModal(message, title) {
    return new Promise(resolve => {
        const modal = document.getElementById('custom-alert-modal');
        const msg = document.getElementById('custom-alert-message');
        const t = document.getElementById('custom-alert-title');
        msg.innerHTML = message;
        t.textContent = title || T('error');
        modal.classList.remove('hidden');

        function close() {
            modal.classList.add('hidden');
            ok.removeEventListener('click', okFn);
            modal.removeEventListener('click', outsideClick);
            document.removeEventListener('keydown', keyHandler);
            resolve();
        }

        const ok = document.getElementById('custom-alert-ok');
        function okFn() { close(); }

        ok.innerText = T("ok");
        ok.addEventListener('click', okFn);

        function outsideClick(e) {
            if (e.target === modal) close();
        }
        modal.addEventListener('click', outsideClick);

        function keyHandler(e) {
            if (e.key === 'Escape' || e.key === 'Enter') close();
        }
        document.addEventListener('keydown', keyHandler);
    });
}

function customChoiceModal(message, title, okText, cancelText) {
    return new Promise(resolve => {
        const modal = document.getElementById('custom-confirm-modal');
        document.getElementById('custom-confirm-title').textContent = title || T('confirm');
        document.getElementById('custom-confirm-message').innerHTML = message;
        const ok = document.getElementById('custom-confirm-ok');
        const cancel = document.getElementById('custom-confirm-cancel');
        ok.innerText = okText || T("ok");
        cancel.innerText = cancelText || T("cancel");
        modal.classList.remove('hidden');

        function close(ret) {
            modal.classList.add('hidden');
            ok.removeEventListener('click', okFn);
            cancel.removeEventListener('click', cancelFn);
            modal.removeEventListener('click', outsideClick);
            document.removeEventListener('keydown', keyHandler);
            ok.innerText = T("ok");
            cancel.innerText = T("cancel");
            resolve(ret);
        }

        function okFn() { close(true); }
        function cancelFn() { close(false); }

        ok.addEventListener('click', okFn, { once: true });
        cancel.addEventListener('click', cancelFn, { once: true });

        function outsideClick(e) {
            if (e.target === modal) close(false);
        }
        modal.addEventListener('click', outsideClick);

        function keyHandler(e) {
            if (e.key === 'Escape') close(false);
            if (e.key === 'Enter') close(true);
        }
        document.addEventListener('keydown', keyHandler);
    });
}

function isTextFile(name, size) {
    const lower = name.toLowerCase();
    const ext = lower.split('.').pop();
    if (lower === "makefile") return true;
    if (['txt', 'js', 'ts', 'go', 'py', 'json', 'md', 'html', 'css', 'sh', 'bash', 'c', 'java', 'cs', 'php', 'rb', 'rs', 'swift', 'kt', 'kts', 'scala', 'pl', 'pm', 'lua', 'dart', 'yaml', 'yml', 'toml', 'ini', 'conf', 'log', 'bashrc', 'rc', 'cfg'].includes(ext)) return true;
    if (['cpp', 'cc', 'cxx', 'hpp', 'hxx', 'h'].includes(ext)) return true;
    if (size && size < 1024 * 1024) {
        return true;
    }
    return false;
}

function showImagePreview(name) {
    const modal = document.getElementById('image-preview-modal');
    const img = document.getElementById('preview-image');
    const fileName = document.getElementById('image-preview-name');
    img.src = `${window.API_PREFIX}download?dir=${encodeURIComponent(curDir)}&name=${encodeURIComponent(name)}`;
    fileName.textContent = name;
    modal.classList.remove('hidden');
}
function closeImagePreview() {
    document.getElementById('image-preview-modal').classList.add('hidden');
    document.getElementById('preview-image').src = '';
}

let mediaFileList = [];
let mediaPreviewIndex = 0;
let autoPlayNext = localStorage.getItem('autoPlayNext') !== 'false'; // Default to true

// Initialize auto play next checkbox
if (document.getElementById('auto-play-next')) {
    document.getElementById('auto-play-next').checked = autoPlayNext;
}

function toggleAutoPlayNext() {
    autoPlayNext = document.getElementById('auto-play-next').checked;
    localStorage.setItem('autoPlayNext', autoPlayNext);
}

function getAllMediaFilesFromList() {
    return window.currentFileList
        .filter(f => !f.isdir && isVideoFile(f.name))
        .map(f => f.name);
}

function getAllAudioFilesFromList() {
    return window.currentFileList
        .filter(f => !f.isdir && isAudioFile(f.name))
        .map(f => f.name);
}

function showPlayer(name) {
    if (isAudioFile(name)) {
        showAudioPlayer(name);
        return;
    }
    mediaFileList = getAllMediaFilesFromList();
    mediaPreviewIndex = mediaFileList.indexOf(name);
    if (mediaPreviewIndex < 0) mediaPreviewIndex = 0;
    updateMediaPlayer();
}

function updateMediaPlayer() {
    if (!mediaFileList.length) return;
    const name = mediaFileList[mediaPreviewIndex];
    const modal = document.getElementById('player-modal');
    const container = document.getElementById('player-container');
    const fileName = document.getElementById('player-file-name');
    container.innerHTML = '';
    let url = `${window.API_PREFIX}download?dir=${encodeURIComponent(curDir)}&name=${encodeURIComponent(name)}`;
    
    if (isVideoFile(name)) {
        const video = document.createElement('video');
        video.controls = true;
        video.autoplay = true;
        video.style.maxWidth = '90vw';
        video.style.maxHeight = '80vh';
        video.style.borderRadius = '0.5rem';
        video.style.boxShadow = '0 4px 16px 0 rgba(0,0,0,0.12)';
        video.style.background = '#000';
        video.src = url;
        
        video.onended = () => {
            if (document.getElementById('auto-play-next').checked) {
                playNextVideo();
            }
        };
        
        container.appendChild(video);
    }
    
    fileName.textContent = name;
    modal.classList.remove('hidden');
    
    // Cyclic browsing: keep buttons enabled if there are multiple media files
    const hasMultipleMedia = mediaFileList.length > 1;
    document.getElementById('player-prev-btn').disabled = !hasMultipleMedia;
    document.getElementById('player-next-btn').disabled = !hasMultipleMedia;
}

function playPrevVideo() {
    if (mediaFileList.length <= 1) return;
    mediaPreviewIndex = (mediaPreviewIndex - 1 + mediaFileList.length) % mediaFileList.length;
    updateMediaPlayer();
}

function playNextVideo() {
    if (mediaFileList.length <= 1) return;
    mediaPreviewIndex = (mediaPreviewIndex + 1) % mediaFileList.length;
    updateMediaPlayer();
}

function closePlayer() {
    document.getElementById('player-modal').classList.add('hidden');
    document.getElementById('player-container').innerHTML = '';
    mediaFileList = [];
    mediaPreviewIndex = 0;
}

// Audio Player Window Logic
let audioFileList = [];
let audioCurrentIndex = 0;
// Modes: 'list' (列表循环), 'single' (单曲循环), 'single-pause' (单曲播放), 'random' (随机播放)
let audioLoopMode = 'list';
let audioBaseDir = '';
// Restore saved mode from localStorage if present
const savedMode = localStorage.getItem('audioLoopMode');
if (savedMode) {
    audioLoopMode = savedMode;
}
const audioPlayer = document.getElementById('audio-html5');
// Reflect stored mode in UI on page load
updateAudioLoopIndicator();

function initAudioEvents() {
    if (audioPlayer.dataset.initialized) return;
    audioPlayer.dataset.initialized = 'true';

    audioPlayer.addEventListener('timeupdate', () => {
        const prog = document.getElementById('audio-progress');
        const curr = document.getElementById('audio-time-current');
        if (audioPlayer.duration) {
            prog.value = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            curr.textContent = formatAudioTime(audioPlayer.currentTime);
        }
    });

    audioPlayer.addEventListener('loadedmetadata', () => {
        document.getElementById('audio-time-total').textContent = formatAudioTime(audioPlayer.duration);
    });

    audioPlayer.addEventListener('ended', () => {
        if (audioLoopMode === 'single') {
            audioPlayer.currentTime = 0;
            audioPlayer.play();
        } else if (audioLoopMode === 'list' || audioLoopMode === 'random') {
            playAudioNext(true);
        } else if (audioLoopMode === 'single-pause') {
            updateAudioPlayBtnState();
        }
    });

    audioPlayer.addEventListener('play', updateAudioPlayBtnState);
    audioPlayer.addEventListener('pause', updateAudioPlayBtnState);
    // Spacebar toggles play/pause when not focusing on input/textarea
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !e.target.matches('input, textarea')) {
            e.preventDefault();
            toggleAudioPlay();
        }
    });

    const progInput = document.getElementById('audio-progress');
    progInput.addEventListener('input', () => {
        if (audioPlayer.duration) {
            audioPlayer.currentTime = (progInput.value / 100) * audioPlayer.duration;
        }
    });

    const volInput = document.getElementById('audio-volume');
    volInput.addEventListener('input', () => {
        audioPlayer.volume = volInput.value / 100;
    });
    audioPlayer.volume = volInput.value / 100; // init volume
}

function updateAudioPlayBtnState() {
    const playBtn = document.getElementById('audio-play-btn');
    const vinyl = document.getElementById('audio-vinyl');
    if (!audioPlayer.paused) {
        playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
        vinyl.style.animationPlayState = 'running';
    } else {
        playBtn.innerHTML = '<i class="fa-solid fa-play ml-1"></i>';
        vinyl.style.animationPlayState = 'paused';
    }
}

function formatAudioTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
}

function toggleAudioLoop() {
    if (audioLoopMode === 'list') {
        audioLoopMode = 'single';
    } else if (audioLoopMode === 'single') {
        audioLoopMode = 'single-pause';
    } else if (audioLoopMode === 'single-pause') {
        audioLoopMode = 'random';
    } else {
        audioLoopMode = 'list';
    }
    // Persist the selected mode
    localStorage.setItem('audioLoopMode', audioLoopMode);
    updateAudioLoopIndicator();
}

// Ensure the HTML button exists or is called properly
function updateAudioLoopIndicator() {
    const btn = document.getElementById('audio-loop-btn');
    if (!btn) return;
    if (audioLoopMode === 'list') {
        btn.title = T('loop_list');
        btn.innerHTML = `
            <div class="relative inline-block w-full h-full flex justify-center items-center">
                <i class="fa-solid fa-repeat"></i>
                <i class="fa-solid fa-list absolute" style="color: #ff4757; font-size: 0.5rem; bottom: 4px; right: 2px;"></i>
            </div>
        `;
    } else if (audioLoopMode === 'single') {
        btn.title = T('loop_single');
        btn.innerHTML = `
            <div class="relative inline-block w-full h-full flex justify-center items-center">
                <i class="fa-solid fa-repeat"></i>
                <span class="absolute font-bold" style="font-size: 0.55rem; bottom: 4px; right: 4px; color: #ff4757;">1</span>
            </div>
        `;
    } else if (audioLoopMode === 'single-pause') {
        btn.title = T('loop_single_pause');
        btn.innerHTML = `
            <div class="relative inline-block w-full h-full flex justify-center items-center">
                <i class="fa-solid fa-repeat" style="opacity: 0.4;"></i>
                <i class="fa-solid fa-ban absolute" style="color: #ff4757; font-size: 0.65rem; top: 4px; right: 1px;"></i>
            </div>
        `;
    } else if (audioLoopMode === 'random') {
        btn.title = T('loop_random');
        btn.innerHTML = `
            <div class="relative inline-block w-full h-full flex justify-center items-center">
                <i class="fa-solid fa-shuffle"></i>
            </div>
        `;
    }
}

function showAudioPlayer(name) {
    const modal = document.getElementById('audio-modal');
    modal.classList.remove('hidden');
    initAudioEvents();

    // Capture the current directory at the moment the player is opened
    audioBaseDir = curDir;
    audioFileList = getAllAudioFilesFromList();
    audioCurrentIndex = audioFileList.indexOf(name);
    if (audioCurrentIndex < 0) audioCurrentIndex = 0;

    // Ensure UI reflects stored mode on opening player
    updateAudioLoopIndicator();
    loadAudioTrack(audioCurrentIndex);
}

function renderAudioPlaylist() {
    const container = document.getElementById('audio-playlist');
    container.innerHTML = '';
    audioFileList.forEach((f, idx) => {
        const item = document.createElement('div');
        if (idx === audioCurrentIndex) item.id = 'audio-playlist-current';
        item.className = `px-3 py-1.5 text-sm cursor-pointer truncate transition-colors ${idx === audioCurrentIndex ? 'text-primary bg-[#2d2e30]' : 'text-gray-400 hover:text-white hover:bg-[#2a2b2c]'}`;
        item.textContent = f;
        item.onclick = () => {
            audioCurrentIndex = idx;
            loadAudioTrack(audioCurrentIndex);
        };
        container.appendChild(item);
    });

    const currentItem = document.getElementById('audio-playlist-current');
    if (currentItem) {
        setTimeout(() => {
            currentItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
    }
}

function loadAudioTrack(idx) {
    if (audioFileList.length === 0) return;
    const name = audioFileList[idx];
    document.getElementById('audio-title').textContent = name;

    let url = `${window.API_PREFIX}download?dir=${encodeURIComponent(audioBaseDir)}&name=${encodeURIComponent(name)}`;
    audioPlayer.src = url;
    audioPlayer.play().catch(e => console.log('play blocked: ', e));
    renderAudioPlaylist();
}

function playAudioNext(auto = false) {
    if (audioFileList.length === 0) return;
    if (audioLoopMode === 'random' && audioFileList.length > 1) {
        let nextIndex = Math.floor(Math.random() * audioFileList.length);
        if (nextIndex === audioCurrentIndex) {
            nextIndex = (nextIndex + 1) % audioFileList.length;
        }
        audioCurrentIndex = nextIndex;
    } else {
        audioCurrentIndex = (audioCurrentIndex + 1) % audioFileList.length;
    }
    loadAudioTrack(audioCurrentIndex);
}

function playAudioPrev() {
    if (audioFileList.length === 0) return;
    if (audioLoopMode === 'random' && audioFileList.length > 1) {
        let prevIndex = Math.floor(Math.random() * audioFileList.length);
        if (prevIndex === audioCurrentIndex) {
            prevIndex = (prevIndex + 1) % audioFileList.length;
        }
        audioCurrentIndex = prevIndex;
    } else {
        audioCurrentIndex = (audioCurrentIndex - 1 + audioFileList.length) % audioFileList.length;
    }
    loadAudioTrack(audioCurrentIndex);
}

function toggleAudioPlay() {
    if (audioPlayer.paused) {
        audioPlayer.play();
    } else {
        audioPlayer.pause();
    }
}

function closeAudioModal() {
    document.getElementById('audio-modal').classList.add('hidden');
    audioPlayer.pause();
}

let isEditingBreadcrumb = false;

function updateBreadcrumb() {
    const bc = document.getElementById('breadcrumb');
    const nav = document.getElementById('breadcrumb-nav');
    const input = document.getElementById('breadcrumb-input');
    bc.innerHTML = '';
    input.classList.add('hidden');
    bc.style.display = '';

    const parts = curDir === "." ? [] : curDir.split(/[\\/]/);
    let path = ".";

    const rootLi = document.createElement('li');
    rootLi.className = "text-gray-500 hover:text-primary cursor-pointer";
    rootLi.innerHTML = `<i class="fa-solid fa-house mr-1"></i>${T('root_dir')}`;
    rootLi.onclick = e => { e.stopPropagation(); curDir = "."; refreshList(); };
    bc.appendChild(rootLi);

    bc.appendChild(document.createTextNode('\u00A0/\u00A0'));

    parts.forEach((p, i) => {
        path += (path === "." ? "" : "/") + p;
        const span = document.createElement('span');
        span.className = i === parts.length - 1 ? "text-dark font-medium" : "text-gray-500 hover:text-primary cursor-pointer";
        span.innerHTML = i === parts.length - 1 ? p : `<span>${p}</span>`;
        span.onclick = e => {
            e.stopPropagation();
            curDir = parts.slice(0, i + 1).join("/") || ".";
            refreshList();
        };
        bc.appendChild(span);
        if (i < parts.length - 1) {
            bc.appendChild(document.createTextNode('\u00A0/\u00A0'));
        }
    });

    nav.onclick = function (e) {
        if (e.target.tagName === 'SPAN' && e.target.onclick) return;
        if (e.target.closest('li')) return;
        if (isEditingBreadcrumb) return;
        isEditingBreadcrumb = true;
        input.value = curDir === "." ? "/" : "/" + curDir;
        if (!input.value.endsWith('/')) input.value += '/';
        input.classList.remove('hidden');
        bc.style.display = 'none';
        input.focus();
        input.select();
    };
}

// 初始化面包屑输入框逻辑
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('breadcrumb-input');
    const bc = document.getElementById('breadcrumb');
    const autocompleteBox = document.getElementById('breadcrumb-autocomplete');
    let selectedIndex = -1;

    function fillInput(suggestion) {
        input.value = suggestion;
        autocompleteBox.classList.add('hidden');

        if (suggestion.endsWith('/')) {
            let val = suggestion.trim();
            curDir = val.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
            if (!curDir) curDir = ".";
            isEditingBreadcrumb = false;
            input.classList.add('hidden');
            bc.style.display = '';
            refreshList();
        } else {
            input.focus();
        }
    }

    function updateSelection(items) {
        items.forEach((item, i) => {
            if (i === selectedIndex) {
                item.classList.add('bg-gray-100', 'dark:bg-gray-700');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('bg-gray-100', 'dark:bg-gray-700');
            }
        });
    }

    input.oninput = async function () {
        const val = input.value;
        if (!val) {
            autocompleteBox.classList.add('hidden');
            return;
        }

        try {
            const res = await fetch(`${window.API_PREFIX}autocomplete?path=${encodeURIComponent(val)}`);
            const suggestions = await res.json();

            if (suggestions && suggestions.length > 0) {
                autocompleteBox.innerHTML = suggestions.map((s, i) =>
                    `<div class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm transition-colors" data-index="${i}">${s}</div>`
                ).join('');
                autocompleteBox.classList.remove('hidden');
                selectedIndex = -1;
            } else {
                autocompleteBox.classList.add('hidden');
            }
        } catch (e) {
            autocompleteBox.classList.add('hidden');
        }
    };

    input.onkeydown = function (e) {
        const items = autocompleteBox.querySelectorAll('div');
        if (e.key === 'ArrowDown') {
            if (!autocompleteBox.classList.contains('hidden') && items.length > 0) {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % items.length;
                updateSelection(items);
            }
        } else if (e.key === 'ArrowUp') {
            if (!autocompleteBox.classList.contains('hidden') && items.length > 0) {
                e.preventDefault();
                selectedIndex = (selectedIndex - 1 + items.length) % items.length;
                updateSelection(items);
            }
        } else if (e.key === 'Tab' || e.key === 'Enter') {
            if (!autocompleteBox.classList.contains('hidden') && selectedIndex !== -1) {
                e.preventDefault();
                fillInput(items[selectedIndex].textContent);
            } else if (e.key === 'Enter') {
                let val = input.value.trim();
                if (!val || val === "/") curDir = ".";
                else curDir = val.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
                isEditingBreadcrumb = false;
                input.classList.add('hidden');
                bc.style.display = '';
                autocompleteBox.classList.add('hidden');
                refreshList();
            }
        } else if (e.key === 'Escape') {
            if (!autocompleteBox.classList.contains('hidden')) {
                autocompleteBox.classList.add('hidden');
            } else {
                isEditingBreadcrumb = false;
                input.classList.add('hidden');
                bc.style.display = '';
            }
        }
    };

    input.onblur = function () {
        setTimeout(() => {
            isEditingBreadcrumb = false;
            input.classList.add('hidden');
            bc.style.display = '';
            autocompleteBox.classList.add('hidden');
        }, 200);
    };

    autocompleteBox.onclick = function (e) {
        const item = e.target.closest('div');
        if (item) {
            fillInput(item.textContent);
        }
    };
});

window.currentFileList = [];

window.addEventListener('popstate', () => {
    curDir = new URLSearchParams(window.location.search).get('path') || '.';
    refreshList();
});

function refreshList(insertMkdir, insertCreateFile) {
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('path', curDir);
    history.pushState({}, '', newUrl);
    updateBreadcrumb();
    let url = `${window.API_PREFIX}list?dir=${encodeURIComponent(curDir)}&showHidden=${showHiddenFiles}`;
    if (searchKeyword) {
        url += `&search=${encodeURIComponent(searchKeyword)}`;
    }
    fetch(url)
        .then(r => r.json())
        .then(list => {
            list = list || [];
            
            // Apply sorting
            list.sort((a, b) => {
                // Directories always first
                if (a.isdir !== b.isdir) {
                    return a.isdir ? -1 : 1;
                }
                
                let comparison = 0;
                if (currentSortField === 'name') {
                    comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
                } else if (currentSortField === 'size') {
                    comparison = a.size - b.size;
                } else if (currentSortField === 'modtime') {
                    comparison = a.modtime - b.modtime;
                }
                
                return currentSortOrder === 'asc' ? comparison : -comparison;
            });

            window.currentFileList = list;
            const tableBody = document.getElementById('file-table-body');
            const gridView = document.getElementById('file-grid-view');
            tableBody.innerHTML = '';
            gridView.innerHTML = '';

            if (currentView === 'list') {
                list.filter(f => f.isdir).forEach(f => {
                    const tr = document.createElement('tr');
                    tr.className = 'file-row-hover';
                    tr.setAttribute('data-name', f.name);
                    tr.setAttribute('data-isdir', '1');

                    if (renameInputRow === f.name) {
                        tr.innerHTML = `
                            <td colspan="6" class="px-4 py-3">
                                <div class="flex items-center">
                                    <input type="checkbox" style="visibility:hidden;">
                                    <input type="text" class="rename-input ml-2 px-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary w-full max-w-xs" id="rename-dir-input" value="${f.name}" onkeydown="renameDirInputKeydown(event, '${escapeJsString(f.name)}')">
                                    <button class="ml-2 px-3 py-1 bg-primary text-white rounded text-sm btn-hover" onclick="renameDirSave(document.getElementById('rename-dir-input'), '${escapeJsString(f.name)}')">${T('save')}</button>
                                    <button class="ml-2 px-3 py-1 bg-gray-100 text-dark rounded text-sm btn-hover" onclick="renameDirCancel()">${T('cancel')}</button>
                                </div>
                            </td>
                        `;
                        setTimeout(() => { document.getElementById('rename-dir-input').focus(); }, 50);
                    } else {
                        tr.innerHTML = `
                            <td class="px-4 py-3 whitespace-nowrap max-w-[400px]">
                                <div class="flex items-center min-w-0">
                                    <input type="checkbox" class="batch-delete-checkbox mr-3 flex-shrink-0" data-name="${f.name}" onclick="updateHeaderCheckbox()">
                                    <i class="fa-solid fa-folder text-warning mr-2 flex-shrink-0"></i>
                                    <a href="#" class="text-primary hover:text-primary/80 truncate font-medium" title="${f.name}">${f.name}</a>
                                    ${f.issymlink && f.linktarget ? `<span class="ml-2 text-gray-400 text-sm flex-shrink-0" title="${T('link_to', { target: f.linktarget })}">→ ${f.linktarget}</span>` : ""}
                                </div>
                            </td>
                            <td class="px-4 py-3 whitespace-nowrap text-gray-500">—</td>
                            <td class="px-4 py-3 whitespace-nowrap text-gray-500">${new Date(f.modtime * 1000).toLocaleString()}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-gray-500 font-mono text-xs">${f.mode || 'drwxr-xr-x'}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-gray-500">${f.owner || '-'}/${f.group || '-'}</td>
                            <td class="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                <button class="text-primary hover:text-primary/80 mr-3 btn-hover" onclick='showRenameInput("${escapeJsString(f.name)}")' title="${T('rename')}">
                                    <i class="fa-solid fa-pencil"></i>
                                </button>
                                <button class="text-secondary hover:text-secondary/80 mr-3 btn-hover" onclick='showChmodModal("${escapeJsString(f.name)}", ${f.isdir})' title="${T('permission')}">
                                    <i class="fa-solid fa-lock"></i>
                                </button>
                                <button class="text-danger hover:text-danger/80 btn-hover" onclick='rmdirPrompt("${escapeJsString(f.name)}")' title="${T('delete')}">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </td>
                        `;
                        tr.querySelector('a').onclick = () => {
                            curDir = curDir === '.' ? f.name : (curDir + '/' + f.name);
                            refreshList();
                        };
                    }

                    tr.addEventListener('click', function (e) {
                        if (e.button !== 0) return;
                        // Only return if clicking the checkbox itself or the action buttons cell
                        if (e.target.closest('input[type="checkbox"]') || e.target.closest('.text-right')) return;
                        
                        const cb = tr.querySelector('.batch-delete-checkbox');
                        if (e.ctrlKey || e.metaKey) {
                            if (cb) cb.checked = !cb.checked;
                        } else {
                            document.querySelectorAll('.batch-delete-checkbox').forEach(c => c.checked = false);
                            if (cb) cb.checked = true;
                        }
                        updateHeaderCheckbox();
                    });

                    tableBody.appendChild(tr);
                });

                list.filter(f => !f.isdir).forEach(f => {
                    const tr = document.createElement('tr');
                    tr.className = 'file-row-hover';
                    tr.setAttribute('data-name', f.name);
                    tr.setAttribute('data-isdir', '0');

                    if (renameFileInputRow === f.name) {
                        tr.innerHTML = `
                                <td colspan="6" class="px-4 py-3">
                                    <div class="flex items-center">
                                        <input type="checkbox" class="batch-delete-checkbox" data-name="${f.name}" onclick="updateHeaderCheckbox()">
                                        <input type="text" class="rename-input ml-2 px-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary w-full max-w-xs" id="rename-file-input" value="${f.name}" onkeydown="renameFileInputKeydown(event, '${f.name.replace(/'/g, "\\'")}')">
                                        <button class="ml-2 px-3 py-1 bg-primary text-white rounded text-sm btn-hover" onclick="renameFileSave(document.getElementById('rename-file-input'), '${f.name.replace(/'/g, "\\'")}')">${T('save')}</button>
                                        <button class="ml-2 px-3 py-1 bg-gray-100 text-dark rounded text-sm btn-hover" onclick="renameFileCancel()">${T('cancel')}</button>
                                    </div>
                                </td>
                            `;
                        setTimeout(() => { document.getElementById('rename-file-input').focus(); }, 50);
                    } else {
                        let fileNameHtml = '';
                        const isCut = clipboardAction === "move" && clipboardDir === curDir && clipboardFiles.includes(f.name);
                        const baseClass = isCut ? 'opacity-50' : '';

                        if (isIpkFile(f.name)) {
                            fileNameHtml = `<span class="cursor-pointer text-green-600 hover:underline ${baseClass}" onclick='showInstallPackageModal("${escapeJsString(f.name)}", "ipk")'>${f.name}</span>`;
                        } else if (isApkFile(f.name)) {
                            fileNameHtml = `<span class="cursor-pointer text-green-600 hover:underline ${baseClass}" onclick='showInstallPackageModal("${escapeJsString(f.name)}", "apk")'>${f.name}</span>`;
                        } else if (isImageFile(f.name)) {
                            fileNameHtml = `<span class="cursor-pointer text-primary hover:underline ${baseClass}" onclick='showImagePreview("${escapeJsString(f.name)}")'>${f.name}</span>`;
                        } else if (isVideoFile(f.name) || isAudioFile(f.name)) {
                            fileNameHtml = `<span class="cursor-pointer text-primary hover:underline ${baseClass}" onclick='showPlayer("${escapeJsString(f.name)}")'>${f.name}</span>`;
                        } else if (isCompressedFile(f.name)) {
                            fileNameHtml = `<a href="${window.API_PREFIX}download?dir=${encodeURIComponent(curDir)}&name=${encodeURIComponent(f.name)}" class="text-primary hover:underline ${baseClass}" target="_blank">${f.name}</a>`;
                        } else if (isTextFile(f.name, f.size)) {
                            fileNameHtml = `<span class="cursor-pointer text-primary hover:underline ${baseClass}" onclick='editFile("${escapeJsString(f.name)}")'>${f.name}</span>`;
                        } else {
                            fileNameHtml = `<a href="${window.API_PREFIX}download?dir=${encodeURIComponent(curDir)}&name=${encodeURIComponent(f.name)}" class="text-primary hover:underline ${baseClass}" target="_blank">${f.name}</a>`;
                        }
                        tr.innerHTML = `
                                <td class="px-4 py-3 whitespace-nowrap max-w-[400px]">
                                    <div class="flex items-center min-w-0 ${baseClass}">
                                        <input type="checkbox" class="batch-delete-checkbox mr-3 flex-shrink-0" data-name="${f.name}" onclick="updateHeaderCheckbox()">
                                        <i class="${getFileIconClass(f.name)} mr-2 flex-shrink-0"></i>
                                        <div class="truncate font-medium" title="${f.name}">${fileNameHtml}</div>
                                        ${f.issymlink && f.linktarget ? `<span class="ml-2 text-gray-400 text-sm flex-shrink-0" title="${T('link_to', { target: f.linktarget })}">→ ${f.linktarget}</span>` : ""}
                                    </div>
                                </td>
                                <td class="px-4 py-3 whitespace-nowrap text-gray-500">${formatSize(f.size)}</td>
                                <td class="px-4 py-3 whitespace-nowrap text-gray-500">${new Date(f.modtime * 1000).toLocaleString()}</td>
                                <td class="px-4 py-3 whitespace-nowrap text-gray-500 font-mono text-xs">${f.mode || '-rw-r--r--'}</td>
                                <td class="px-4 py-3 whitespace-nowrap text-gray-500">${f.owner || '-'}/${f.group || '-'}</td>
                                <td class="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                    <a href="${window.API_PREFIX}download?dir=${encodeURIComponent(curDir)}&name=${encodeURIComponent(f.name)}" target="_blank" class="text-success hover:text-success/80 mr-3 btn-hover" title="${T('download')}">
                                        <i class="fa-solid fa-download"></i>
                                    </a>
                                    <button class="text-warning hover:text-warning/80 mr-3 btn-hover" onclick='editFile("${escapeJsString(f.name)}")' title="${T('edit')}">
                                        <i class="fa-solid fa-pen-to-square"></i>
                                    </button>
                                    <button class="text-primary hover:text-primary/80 mr-3 btn-hover" onclick='showRenameFileInput("${escapeJsString(f.name)}")' title="${T('rename')}">
                                        <i class="fa-solid fa-pencil"></i>
                                    </button>
                                    <button class="text-secondary hover:text-secondary/80 mr-3 btn-hover" onclick='showChmodModal("${escapeJsString(f.name)}", ${f.isdir})' title="${T('permission')}">
                                        <i class="fa-solid fa-lock"></i>
                                    </button>
                                    <button class="text-danger hover:text-danger/80 btn-hover" onclick='deleteFile("${escapeJsString(f.name)}")' title="${T('delete')}">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>
                                </td>
                            `;
                    }

                    tr.addEventListener('click', function (e) {
                        if (e.button !== 0) return;
                        // Only return if clicking the checkbox itself or the action buttons cell
                        if (e.target.closest('input[type="checkbox"]') || e.target.closest('.text-right')) return;

                        const cb = tr.querySelector('.batch-delete-checkbox');
                        if (e.ctrlKey || e.metaKey) {
                            if (cb) cb.checked = !cb.checked;
                        } else {
                            document.querySelectorAll('.batch-delete-checkbox').forEach(c => c.checked = false);
                            if (cb) cb.checked = true;
                        }
                        updateHeaderCheckbox();
                    });

                    tableBody.appendChild(tr);
                });

                if (insertMkdir) {
                    mkdirInputRow = true;
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td colspan="6" class="px-4 py-3">
                            <div class="flex items-center">
                                <input type="checkbox" style="visibility:hidden;">
                                <input type="text" class="rename-input ml-2 px-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary w-full max-w-xs" id="mkdir-input" placeholder="${T('mkdir_placeholder')}" onkeydown="mkdirInputKeydown(event)">
                                <button class="ml-2 px-3 py-1 bg-primary text-white rounded text-sm btn-hover" onclick="mkdirSave(document.getElementById('mkdir-input'))">${T('create')}</button>
                                <button class="ml-2 px-3 py-1 bg-gray-100 text-dark rounded text-sm btn-hover" onclick="mkdirCancel()">${T('cancel')}</button>
                            </div>
                        </td>
                    `;
                    if (tableBody.firstChild) {
                        tableBody.insertBefore(tr, tableBody.firstChild);
                    } else {
                        tableBody.appendChild(tr);
                    }
                    setTimeout(() => { document.getElementById('mkdir-input').focus(); }, 50);
                }

                if (insertCreateFile) {
                    createFileInputRow = true;
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td colspan="6" class="px-4 py-3">
                            <div class="flex items-center">
                                <input type="checkbox" style="visibility:hidden;">
                                <input type="text" class="rename-input ml-2 px-3 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary w-full max-w-xs" id="create-file-input" placeholder="${T('createfile_placeholder')}" onkeydown="createFileInputKeydown(event)">
                                <button class="ml-2 px-3 py-1 bg-primary text-white rounded text-sm btn-hover" onclick="createFileSave(document.getElementById('create-file-input'))">${T('create')}</button>
                                <button class="ml-2 px-3 py-1 bg-gray-100 text-dark rounded text-sm btn-hover" onclick="createFileCancel()">${T('cancel')}</button>
                            </div>
                        </td>
                    `;
                    if (tableBody.firstChild) {
                        tableBody.insertBefore(tr, tableBody.firstChild);
                    } else {
                        tableBody.appendChild(tr);
                    }
                    setTimeout(() => { document.getElementById('create-file-input').focus(); }, 50);
                }
            } else {
                if (insertMkdir) {
                    mkdirInputRow = true;
                    const item = document.createElement('div');
                    item.className = 'file-grid-item';
                    item.innerHTML = `
                        <div class="file-icon"><i class="fa-solid fa-folder text-warning"></i></div>
                        <div class="file-name">
                            <input type="text" class="rename-input w-full text-center" id="mkdir-input" placeholder="${T('mkdir_placeholder')}" onkeydown="mkdirInputKeydown(event)">
                        </div>
                        <div class="flex items-center mt-2">
                            <button class="px-2 py-1 bg-primary text-white rounded text-xs btn-hover" onclick="mkdirSave(document.getElementById('mkdir-input'))">${T('create')}</button>
                            <button class="ml-1 px-2 py-1 bg-gray-100 text-dark rounded text-xs btn-hover" onclick="mkdirCancel()">${T('cancel')}</button>
                        </div>
                    `;
                    if (gridView.firstChild) {
                        gridView.insertBefore(item, gridView.firstChild);
                    } else {
                        gridView.appendChild(item);
                    }
                    setTimeout(() => { document.getElementById('mkdir-input').focus(); }, 50);
                }

                if (insertCreateFile) {
                    createFileInputRow = true;
                    const item = document.createElement('div');
                    item.className = 'file-grid-item';
                    item.innerHTML = `
                        <div class="file-icon"><i class="fa-regular fa-file"></i></div>
                        <div class="file-name">
                            <input type="text" class="rename-input w-full text-center" id="create-file-input" placeholder="${T('createfile_placeholder')}" onkeydown="createFileInputKeydown(event)">
                        </div>
                        <div class="flex items-center mt-2">
                            <button class="px-2 py-1 bg-primary text-white rounded text-xs btn-hover" onclick="createFileSave(document.getElementById('create-file-input'))">${T('create')}</button>
                            <button class="ml-1 px-2 py-1 bg-gray-100 text-dark rounded text-xs btn-hover" onclick="createFileCancel()">${T('cancel')}</button>
                        </div>
                    `;
                    if (gridView.firstChild) {
                        gridView.insertBefore(item, gridView.firstChild);
                    } else {
                        gridView.appendChild(item);
                    }
                    setTimeout(() => { document.getElementById('create-file-input').focus(); }, 50);
                }

                [...list.filter(f => f.isdir), ...list.filter(f => !f.isdir)].forEach(f => {
                    const item = document.createElement('div');
                    item.className = 'file-grid-item';
                    item.setAttribute('data-name', f.name);
                    item.setAttribute('data-isdir', f.isdir ? '1' : '0');

                    if (renameInputRow === f.name) {
                        item.innerHTML = `
                            <div class="file-icon"><i class="fa-solid fa-folder text-warning"></i></div>
                            <div class="file-name px-1 w-full">
                                <input type="text" class="rename-input w-full text-center text-xs px-1 py-0.5 border border-primary rounded focus:outline-none" id="rename-dir-input" value="${f.name}" onkeydown="renameDirInputKeydown(event, '${escapeJsString(f.name)}')">
                            </div>
                            <div class="flex items-center mt-1.5 justify-center space-x-1">
                                <button class="px-2 py-0.5 bg-primary text-white rounded text-[10px]" onclick="renameDirSave(document.getElementById('rename-dir-input'), '${escapeJsString(f.name)}')">${T('save')}</button>
                                <button class="px-2 py-0.5 bg-gray-100 text-dark rounded text-[10px]" onclick="renameDirCancel()">${T('cancel')}</button>
                            </div>
                        `;
                        setTimeout(() => { document.getElementById('rename-dir-input').focus(); }, 50);
                    } else if (renameFileInputRow === f.name) {
                        item.innerHTML = `
                            <div class="file-icon"><i class="${getFileIconClass(f.name)}"></i></div>
                            <div class="file-name px-1 w-full">
                                <input type="text" class="rename-input w-full text-center text-xs px-1 py-0.5 border border-primary rounded focus:outline-none" id="rename-file-input" value="${f.name}" onkeydown="renameFileInputKeydown(event, '${escapeJsString(f.name)}')">
                            </div>
                            <div class="flex items-center mt-1.5 justify-center space-x-1">
                                <button class="px-2 py-0.5 bg-primary text-white rounded text-[10px]" onclick="renameFileSave(document.getElementById('rename-file-input'), '${escapeJsString(f.name)}')">${T('save')}</button>
                                <button class="px-2 py-0.5 bg-gray-100 text-dark rounded text-[10px]" onclick="renameFileCancel()">${T('cancel')}</button>
                            </div>
                        `;
                        setTimeout(() => { document.getElementById('rename-file-input').focus(); }, 50);
                    } else {
                        let fileIcon;
                        const isCut = clipboardAction === "move" && clipboardDir === curDir && clipboardFiles.includes(f.name);
                        const baseClass = isCut ? 'opacity-50' : '';

                        if (f.isdir) {
                            fileIcon = `<i class="fa fa-folder text-warning ${baseClass}"></i>`;
                        } else if (isImageFile(f.name)) {
                            fileIcon = `<img src="${window.API_PREFIX}thumbnail?dir=${encodeURIComponent(curDir)}&name=${encodeURIComponent(f.name)}" alt="${f.name}" class="${baseClass}" onerror="this.onerror=null;this.parentElement.innerHTML='<i class=\'fa-regular fa-image\'></i>'">`;
                        } else {
                            fileIcon = `<i class="${getFileIconClass(f.name)} ${baseClass}"></i>`;
                        }

                        item.innerHTML = `
                            <input type="checkbox" class="batch-delete-checkbox" data-name="${f.name}" data-isdir="${f.isdir ? '1' : '0'}" style="display: none;">
                            <div class="file-icon">
                                ${fileIcon}
                            </div>
                            <div class="file-name ${(!f.isdir && (isIpkFile(f.name) || isApkFile(f.name))) ? 'text-green-600' : ''} ${baseClass}">${f.name}</div>
                        `;

                        if (f.isdir) {
                            item.onclick = () => {
                                curDir = curDir === '.' ? f.name : (curDir + '/' + f.name);
                                refreshList();
                            };
                        } else {
                            if (isIpkFile(f.name)) {
                                item.onclick = () => showInstallPackageModal(f.name, 'ipk');
                            } else if (isApkFile(f.name)) {
                                item.onclick = () => showInstallPackageModal(f.name, 'apk');
                            } else if (isImageFile(f.name)) {
                                item.onclick = () => showImagePreview(f.name);
                            } else if (isVideoFile(f.name) || isAudioFile(f.name)) {
                                item.onclick = () => showPlayer(f.name);
                            } else if (isCompressedFile(f.name)) {
                                item.onclick = () => {
                                    window.open(`${window.API_PREFIX}download?dir=${encodeURIComponent(curDir)}&name=${encodeURIComponent(f.name)}`, '_blank');
                                };
                            } else if (isTextFile(f.name, f.size)) {
                                item.onclick = () => editFile(f.name);
                            } else {
                                item.onclick = () => {
                                    window.open(`${window.API_PREFIX}download?dir=${encodeURIComponent(curDir)}&name=${encodeURIComponent(f.name)}`, '_blank');
                                };
                            }
                        }
                    }
                    gridView.appendChild(item);
                });
            }

            updateHeaderCheckbox();
        });
}

let imageFileList = [];
let imagePreviewIndex = 0;

function getAllImageFilesFromList() {
    return window.currentFileList
        .filter(f => !f.isdir && isImageFile(f.name))
        .map(f => f.name);
}

function showImagePreview(name) {
    imageFileList = getAllImageFilesFromList();
    imagePreviewIndex = imageFileList.indexOf(name);
    if (imagePreviewIndex < 0) imagePreviewIndex = 0;
    updateImagePreview();
}

let scale = 1;
let panning = false;
let pointX = 0;
let pointY = 0;
let start = { x: 0, y: 0 };

function updateImagePreview() {
    if (!imageFileList.length) return;
    const name = imageFileList[imagePreviewIndex];
    const modal = document.getElementById('image-preview-modal');
    const img = document.getElementById('preview-image');
    const fileName = document.getElementById('image-preview-name');
    img.src = `${window.API_PREFIX}download?dir=${encodeURIComponent(curDir)}&name=${encodeURIComponent(name)}`;
    fileName.textContent = name;
    modal.classList.remove('hidden');
    
    // Cyclic browsing: keep buttons enabled if there are multiple images
    const hasMultipleImages = imageFileList.length > 1;
    document.getElementById('preview-prev-btn').disabled = !hasMultipleImages;
    document.getElementById('preview-next-btn').disabled = !hasMultipleImages;

    // Reset zoom and pan
    scale = 1;
    start = { x: 0, y: 0 };
    img.style.transform = 'scale(1) translate(0, 0)';
    img.style.cursor = 'zoom-in';
}

function previewPrevImage() {
    if (imageFileList.length <= 1) return;
    imagePreviewIndex = (imagePreviewIndex - 1 + imageFileList.length) % imageFileList.length;
    updateImagePreview();
}

function previewNextImage() {
    if (imageFileList.length <= 1) return;
    imagePreviewIndex = (imagePreviewIndex + 1) % imageFileList.length;
    updateImagePreview();
}

function closeImagePreview() {
    document.getElementById('image-preview-modal').classList.add('hidden');
    document.getElementById('preview-image').src = '';
    imageFileList = [];
    imagePreviewIndex = 0;
    // Reset zoom and pan
    scale = 1;
    start = { x: 0, y: 0 };
    const img = document.getElementById('preview-image');
    img.style.transform = 'scale(1) translate(0, 0)';
    img.style.cursor = 'zoom-in';
}

document.addEventListener('keydown', function (e) {
    const imgModal = document.getElementById('image-preview-modal');
    if (imgModal && !imgModal.classList.contains('hidden')) {
        if (e.key === 'ArrowLeft') previewPrevImage();
        if (e.key === 'ArrowRight') previewNextImage();
        if (e.key === 'Escape') closeImagePreview();
        return;
    }

    const playerModal = document.getElementById('player-modal');
    if (playerModal && !playerModal.classList.contains('hidden')) {
        if (e.key === 'ArrowLeft') playPrevVideo();
        if (e.key === 'ArrowRight') playNextVideo();
        if (e.key === 'Escape') closePlayer();
        return;
    }
});

const imagePreviewModal = document.getElementById('image-preview-modal');
const previewImage = document.getElementById('preview-image');

previewImage.addEventListener('dblclick', function (e) {
    if (scale > 1) {
        scale = 1;
        start = { x: 0, y: 0 };
        previewImage.style.transform = 'scale(1) translate(0, 0)';
        previewImage.style.cursor = 'zoom-in';
    }
});

previewImage.addEventListener('mousedown', function (e) {
    if (scale <= 1) return;

    e.preventDefault();
    panning = true;
    pointX = e.clientX;
    pointY = e.clientY;
    previewImage.style.cursor = 'grabbing';

    function onMouseMove(e) {
        if (!panning) return;
        e.preventDefault();
        const dx = e.clientX - pointX;
        const dy = e.clientY - pointY;
        pointX = e.clientX;
        pointY = e.clientY;
        start.x += dx / scale;
        start.y += dy / scale;
        previewImage.style.transform = `scale(${scale}) translate(${start.x}px, ${start.y}px)`;
    }

    function onMouseUp(e) {
        panning = false;
        previewImage.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
});

imagePreviewModal.addEventListener('wheel', function (e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = scale + delta;
    if (newScale >= 1) {
        scale = newScale;
        previewImage.style.transform = `scale(${scale}) translate(${start.x}px, ${start.y}px)`;
        if (scale > 1) {
            previewImage.style.cursor = 'grab';
        } else {
            previewImage.style.cursor = 'zoom-in';
            start = { x: 0, y: 0 };
            previewImage.style.transform = 'scale(1) translate(0, 0)';
        }
    }
});

function customAlert(message, title) {
    return new Promise(resolve => {
        const modal = document.getElementById('custom-alert-modal');
        const msg = document.getElementById('custom-alert-message');
        const t = document.getElementById('custom-alert-title');
        msg.textContent = message;
        t.textContent = title || T('hint');
        modal.classList.remove('hidden');

        function close() {
            modal.classList.add('hidden');
            ok.removeEventListener('click', okFn);
            modal.removeEventListener('click', outsideClick);
            document.removeEventListener('keydown', keyHandler);
            resolve();
        }

        const ok = document.getElementById('custom-alert-ok');
        function okFn() { close(); }

        ok.addEventListener('click', okFn);

        function outsideClick(e) {
            if (e.target === modal) close();
        }
        modal.addEventListener('click', outsideClick);

        function keyHandler(e) {
            if (e.key === 'Escape' || e.key === 'Enter') close();
        }
        document.addEventListener('keydown', keyHandler);
    });
}

function updateHeaderCheckbox() {
    const checkboxes = document.querySelectorAll('.batch-delete-checkbox');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    const archiveBtn = document.getElementById('archive-btn');
    if (archiveBtn) {
        archiveBtn.disabled = checkedCount === 0;
    }
    
    const headerCheckbox = document.getElementById('header-checkbox');
    if (headerCheckbox && checkboxes.length > 0) {
        headerCheckbox.checked = checkedCount === checkboxes.length;
    }

    // Update row/item highlights
    checkboxes.forEach(cb => {
        const parent = cb.closest('tr, .file-grid-item');
        if (parent) {
            if (cb.checked) {
                if (parent.tagName === 'TR') parent.classList.add('bg-light');
                else parent.classList.add('selected');
            } else {
                if (parent.tagName === 'TR') parent.classList.remove('bg-light');
                else parent.classList.remove('selected');
            }
        }
    });
}

function headerCheckboxClick() {
    const all = document.querySelectorAll('.batch-delete-checkbox');
    const headerCheckbox = document.getElementById('header-checkbox');
    all.forEach(cb => cb.checked = headerCheckbox.checked);
    updateHeaderCheckbox();
}

function copyFiles() {
    const checkboxes = document.querySelectorAll('.batch-delete-checkbox:checked');
    const names = Array.from(checkboxes).map(cb => cb.getAttribute('data-name'));
    if (names.length === 0) {
        customAlert(T("copy_empty_error"));
        return;
    }
    clipboardAction = "copy";
    clipboardFiles = names;
    clipboardDir = curDir;
    refreshList();
}

function moveFiles() {
    const checkboxes = document.querySelectorAll('.batch-delete-checkbox:checked');
    const names = Array.from(checkboxes).map(cb => cb.getAttribute('data-name'));
    if (names.length === 0) {
        customAlert(T("cut_empty_error"));
        return;
    }
    clipboardAction = "move";
    clipboardFiles = names;
    clipboardDir = curDir;
    refreshList();
}

async function pasteFiles() {
    if (!clipboardAction || !clipboardFiles || !clipboardFiles.length || !clipboardDir) {
        await customAlert(T("paste_empty_error"));
        return;
    }
    if (clipboardDir === curDir) {
        await customAlert(T("paste_same_dir_error"));
        return;
    }
    if (clipboardFiles.some(f => curDir.startsWith(clipboardDir + "/" + f))) {
        await customAlert(T("paste_conflict_error"));
        return;
    }
    let url = clipboardAction === "copy" ? window.API_PREFIX + "copy" : window.API_PREFIX + "move";
    const data = new URLSearchParams();
    data.append('srcDir', clipboardDir);
    data.append('dstDir', curDir);
    clipboardFiles.forEach(n => data.append('names[]', n));
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: data.toString(),
    }).then(async r => {
        const res = await r.json();
        if (res.success) {
            clipboardAction = null;
            clipboardFiles = [];
            clipboardDir = null;
            refreshList();
        } else {
            let msg = T("delete_batch_error", { failed: (res.failed || []).join(", ") });
            customAlert(msg);
            refreshList();
        }
    });
}

async function batchDeleteFiles() {
    const checkboxes = document.querySelectorAll('.batch-delete-checkbox:checked');
    const names = Array.from(checkboxes).map(cb => cb.getAttribute('data-name'));
    if (names.length === 0) {
        await customAlert(T("delete_empty_error"));
        return;
    }
    if (!await customConfirm(T("delete_batch_confirm", { count: names.length }))) return;
    const data = new URLSearchParams();
    data.append('dir', curDir);
    names.forEach(n => data.append('names[]', n));
    fetch(window.API_PREFIX + 'delete_batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: data.toString(),
    }).then(async r => {
        const res = await r.json();
        if (res.success) {
            refreshList();
        } else {
            alert(T("delete_batch_error", { failed: (res.failed || []).join(", ") }));
            refreshList();
        }
    });
}

function symbolicToOctal(mode) {
    if (!mode || mode.length < 10) {
        return '0644'; // Default or error
    }
    let octal = 0;
    const map = { 'r': 4, 'w': 2, 'x': 1, '-': 0 };

    for (let i = 0; i < 3; i++) {
        let part = mode.substring(1 + i * 3, 4 + i * 3);
        let octalPart = (map[part[0]] || 0) + (map[part[1]] || 0) + (map[part[2]] || 0);
        octal = (octal << 3) | octalPart;
    }

    return octal.toString(8).padStart(3, '0');
}

function showChmodModal(name, isDir) {
    chmodTargetName = name;
    document.getElementById('chmod-filename').innerText = name;
    const file = window.currentFileList.find(f => f.name === name);
    const initialMode = file ? symbolicToOctal(file.mode) : '0644';
    document.getElementById('chmod-input').value = initialMode;
    document.getElementById('owner-input').value = '';
    document.getElementById('group-input').value = '';
    document.getElementById('chmod-msg').classList.add('hidden');
    document.getElementById('chmod-modal').classList.remove('hidden');

    const recursiveContainer = document.getElementById('recursive-chmod-container');
    if (isDir) {
        recursiveContainer.classList.remove('hidden');
    } else {
        recursiveContainer.classList.add('hidden');
    }
    document.getElementById('recursive-chmod').checked = false;

    updateCheckboxesFromMode(initialMode);

    const chmodInput = document.getElementById('chmod-input');
    chmodInput.addEventListener('input', () => {
        const mode = chmodInput.value;
        if (/^[0-7]{3,4}$/.test(mode)) {
            updateCheckboxesFromMode(mode);
        }
    });

    const permissionCheckboxes = document.querySelectorAll('.permission-cb');
    permissionCheckboxes.forEach(cb => {
        cb.addEventListener('change', updateModeFromCheckboxes);
    });
}

function closeChmodModal() {
    document.getElementById('chmod-modal').classList.add('hidden');
}

function doChmodChown() {
    const mode = document.getElementById('chmod-input').value.trim();
    const owner = document.getElementById('owner-input').value.trim();
    const group = document.getElementById('group-input').value.trim();
    const recursive = document.getElementById('recursive-chmod').checked;
    let error = '';
    if (mode && !/^[0-7]{3,4}$/.test(mode)) error = T('permission_format_error');
    if (error) {
        document.getElementById('chmod-msg').innerText = error;
        document.getElementById('chmod-msg').classList.remove('hidden');
        return;
    }

    let p = Promise.resolve();
    if (mode) {
        p = fetch(window.API_PREFIX + 'chmod', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `name=${encodeURIComponent(chmodTargetName)}&dir=${encodeURIComponent(curDir)}&mode=${encodeURIComponent(mode)}&recursive=${recursive}`
        }).then(r => r.json());
    }

    p.then(() => {
        if (owner) {
            return fetch(window.API_PREFIX + 'chown', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `name=${encodeURIComponent(chmodTargetName)}&dir=${encodeURIComponent(curDir)}&owner=${encodeURIComponent(owner)}&group=${encodeURIComponent(group)}`
            }).then(r => r.json());
        }
    }).then(() => {
        closeChmodModal();
        refreshList();
    }).catch(async err => {
        let msg = T("operation_failed");
        if (err.text) msg = await err.text();
        document.getElementById('chmod-msg').innerText = msg;
        document.getElementById('chmod-msg').classList.remove('hidden');
    });
}

function updateCheckboxesFromMode(mode) {
    const modeInt = parseInt(mode, 8);
    document.getElementById('owner-read').checked = (modeInt & 0o400) !== 0;
    document.getElementById('owner-write').checked = (modeInt & 0o200) !== 0;
    document.getElementById('owner-exec').checked = (modeInt & 0o100) !== 0;
    document.getElementById('group-read').checked = (modeInt & 0o040) !== 0;
    document.getElementById('group-write').checked = (modeInt & 0o020) !== 0;
    document.getElementById('group-exec').checked = (modeInt & 0o010) !== 0;
    document.getElementById('other-read').checked = (modeInt & 0o004) !== 0;
    document.getElementById('other-write').checked = (modeInt & 0o002) !== 0;
    document.getElementById('other-exec').checked = (modeInt & 0o001) !== 0;
}

function updateModeFromCheckboxes() {
    let mode = 0;
    if (document.getElementById('owner-read').checked) mode |= 0o400;
    if (document.getElementById('owner-write').checked) mode |= 0o200;
    if (document.getElementById('owner-exec').checked) mode |= 0o100;
    if (document.getElementById('group-read').checked) mode |= 0o040;
    if (document.getElementById('group-write').checked) mode |= 0o020;
    if (document.getElementById('group-exec').checked) mode |= 0o010;
    if (document.getElementById('other-read').checked) mode |= 0o004;
    if (document.getElementById('other-write').checked) mode |= 0o002;
    if (document.getElementById('other-exec').checked) mode |= 0o001;
    document.getElementById('chmod-input').value = mode.toString(8).padStart(4, '0');
}

function customConfirm(message) {
    return new Promise(resolve => {
        const modal = document.getElementById('custom-confirm-modal');
        const msg = document.getElementById('custom-confirm-message');
        msg.textContent = message;
        modal.classList.remove('hidden');

        function close(ret) {
            modal.classList.add('hidden');
            ok.removeEventListener('click', okFn);
            cancel.removeEventListener('click', cancelFn);
            modal.removeEventListener('click', outsideClick);
            document.removeEventListener('keydown', keyHandler);
            resolve(ret);
        }

        const ok = document.getElementById('custom-confirm-ok');
        const cancel = document.getElementById('custom-confirm-cancel');

        function okFn() { close(true); }
        function cancelFn() { close(false); }

        ok.addEventListener('click', okFn);
        cancel.addEventListener('click', cancelFn);

        function outsideClick(e) {
            if (e.target === modal) close(false);
        }
        modal.addEventListener('click', outsideClick);

        function keyHandler(e) {
            if (e.key === 'Escape') close(false);
            if (e.key === 'Enter') close(true);
        }
        document.addEventListener('keydown', keyHandler);
    });
}

async function deleteFile(name) {
    if (!await customConfirm(T('delete_confirm', { name: name }))) return;
    fetch(window.API_PREFIX + 'delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'name=' + encodeURIComponent(name) + '&dir=' + encodeURIComponent(curDir)
    }).then(r => r.json()).then(() => refreshList());
}

async function rmdirPrompt(name) {
    if (!await customConfirm(T('delete_confirm', { name: name }))) return;
    fetch(window.API_PREFIX + 'rmdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'name=' + encodeURIComponent(name) + '&dir=' + encodeURIComponent(curDir)
    }).then(r => r.json()).then(() => refreshList());
}

function editFile(name) {
    fetch(`${window.API_PREFIX}readfile?dir=${encodeURIComponent(curDir)}&name=${encodeURIComponent(name)}`)
        .then(r => {
            if (!r.ok) throw r;
            return r.json();
        })
        .then(data => {
            editingFileName = name;
            document.getElementById('editor-filename').innerText = name;
            document.getElementById('editor-msg').classList.add('hidden');

            const modal = document.getElementById('editor-modal');
            modal.classList.remove('hidden');

            // Initialize size and position for the floating window
            const w = Math.min(1000, window.innerWidth * 0.85);
            const h = Math.min(650, window.innerHeight * 0.85);
            modal.style.width = w + 'px';
            modal.style.height = h + 'px';
            modal.style.left = (window.innerWidth - w) / 2 + 'px';
            modal.style.top = (window.innerHeight - h) / 2 + 'px';

            setTimeout(() => {
                if (monacoInstance) {
                    monacoInstance.dispose();
                }

                let currentLang = (document.documentElement.lang || '').toLowerCase();
                let monacoLang = '';
                if (currentLang.includes('zh-cn') || currentLang.includes('zh-hans')) {
                    monacoLang = 'zh-cn';
                } else if (currentLang.includes('zh-tw') || currentLang.includes('zh-hk') || currentLang.includes('zh-hant')) {
                    monacoLang = 'zh-tw';
                }

                let reqConfig = { paths: { 'vs': window.STATIC_PREFIX + 'vs' } };
                if (monacoLang) {
                    reqConfig['vs/nls'] = { availableLanguages: { '*': monacoLang } };
                }
                require.config(reqConfig);

                require(['vs/editor/editor.main'], function () {
                    monaco.editor.defineTheme('vs-dark-new', {
                        base: 'vs-dark',
                        inherit: true,
                        rules: [],
                        colors: {
                            'editor.background': '#1e1f20'
                        }
                    });

                    monacoInstance = monaco.editor.create(document.getElementById('editor-monaco'), {
                        value: data.content,
                        language: guessLanguage(name),
                        theme: "vs-dark-new",
                        automaticLayout: true,
                        fontSize: 15,
                        minimap: { enabled: false }
                    });

                    monacoInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function() {
                        saveEditFile();
                    });
                });
            }, 10);
        })
        .catch(async err => {
            let msg = T("read_file_failed");
            if (err.text) msg = await err.text();
            document.getElementById('editor-msg').innerText = msg;
            document.getElementById('editor-msg').classList.remove('hidden');
            document.getElementById('editor-modal').classList.remove('hidden');
        });
}

function closeEditorModal() {
    document.getElementById('editor-modal').classList.add('hidden');
    if (monacoInstance) {
        monacoInstance.dispose();
        monacoInstance = null;
    }
    editingFileName = null;
}

function saveEditFile() {
    if (!monacoInstance) return;
    const content = monacoInstance.getValue();
    const btn = document.getElementById('editor-save-btn');
    const msgEl = document.getElementById('editor-msg');

    // UI Feedback
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i><span>${T('saving')}</span>`;
    btn.disabled = true;

    fetch(window.API_PREFIX + 'writefile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `name=${encodeURIComponent(editingFileName)}&dir=${encodeURIComponent(curDir)}&content=${encodeURIComponent(content)}`
    })
        .then(r => {
            if (!r.ok) throw r;
            return r.json();
        })
        .then(() => {
            msgEl.textContent = T('content_saved');
            msgEl.className = 'text-success text-sm fade-in';
            msgEl.classList.remove('hidden');
            setTimeout(() => { msgEl.classList.add('hidden'); }, 3000);

            btn.innerHTML = originalText;
            btn.disabled = false;
            refreshList();
        })
        .catch(async err => {
            let msg = T("save_failed");
            if (err.text) msg = await err.text();
            msgEl.innerText = msg;
            msgEl.className = 'text-danger text-sm fade-in';
            msgEl.classList.remove('hidden');

            btn.innerHTML = originalText;
            btn.disabled = false;
        });
}

function guessLanguage(name) {
    const lower = name.toLowerCase();
    const ext = lower.split('.').pop();
    if (lower === "makefile") return "makefile";
    if (ext === 'js') return 'javascript';
    if (ext === 'ts') return 'typescript';
    if (ext === 'go') return 'go';
    if (ext === 'py') return 'python';
    if (ext === 'json') return 'json';
    if (ext === 'md') return 'markdown';
    if (ext === 'html') return 'html';
    if (ext === 'css') return 'css';
    if (ext === 'sh' || ext === 'bash') return 'shell';
    if (ext === 'c') return 'c';
    if (['cpp', 'cc', 'cxx', 'hpp', 'hxx', 'h'].includes(ext)) return 'cpp';
    if (ext === 'java') return 'java';
    if (ext === 'cs') return 'csharp';
    if (ext === 'php') return 'php';
    if (ext === 'rb') return 'ruby';
    if (ext === 'rs') return 'rust';
    if (ext === 'swift') return 'swift';
    if (ext === 'kt' || ext === 'kts') return 'kotlin';
    if (ext === 'scala') return 'scala';
    if (ext === 'pl' || ext === 'pm') return 'perl';
    if (ext === 'lua') return 'lua';
    if (ext === 'dart') return 'dart';
    if (ext === 'yaml' || ext === 'yml') return 'yaml';
    if (ext === 'toml') return 'toml';
    if (ext === 'ini') return 'ini';
    return 'plaintext';
}

function showMkdirInput() {
    if (mkdirInputRow || createFileInputRow) return;
    refreshList(true, false);
}

function mkdirInputKeydown(e) {
    if (e.key === 'Enter') {
        mkdirSave(e.target);
    }
}

function mkdirSave(input) {
    const name = input.value.trim();
    if (!name) return;
    fetch(window.API_PREFIX + 'mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `name=${encodeURIComponent(name)}&dir=${encodeURIComponent(curDir)}`
    })
        .then(r => {
            if (!r.ok) throw new Error(r.statusText);
            return r.json();
        })
        .then(() => {
            mkdirInputRow = null;
            refreshList();
        })
        .catch(err => {
            alert(T('mkdir_failed') + ': ' + err.message);
            mkdirInputRow = null;
            refreshList();
        });
}

function mkdirCancel() {
    mkdirInputRow = null;
    refreshList();
}

function showCreateFileInput() {
    if (createFileInputRow || mkdirInputRow) return;
    refreshList(false, true);
}

function createFileInputKeydown(e) {
    if (e.key === 'Enter') {
        createFileSave(e.target);
    }
}

function createFileSave(input) {
    const name = input.value.trim();
    if (!name) return;
    fetch(window.API_PREFIX + 'createfile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `name=${encodeURIComponent(name)}&dir=${encodeURIComponent(curDir)}`
    })
        .then(r => {
            if (!r.ok) throw new Error(r.statusText);
            return r.json();
        })
        .then(() => {
            createFileInputRow = null;
            refreshList();
        })
        .catch(err => {
            alert(T('createfile_failed') + ': ' + err.message);
            createFileInputRow = null;
            refreshList();
        });
}

function createFileCancel() {
    createFileInputRow = null;
    refreshList();
}

function showRenameInput(oldName) {
    if (renameInputRow || renameFileInputRow) return;
    renameInputRow = oldName;
    refreshList();
}

function renameDirInputKeydown(e, oldName) {
    if (e.key === 'Enter') {
        renameDirSave(e.target, oldName);
    }
}

function renameDirSave(input, oldName) {
    const newName = input.value.trim();
    if (!newName || newName === oldName) return;
    fetch(window.API_PREFIX + 'renamedir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `from=${encodeURIComponent(oldName)}&to=${encodeURIComponent(newName)}&dir=${encodeURIComponent(curDir)}`
    })
        .then(r => {
            if (!r.ok) throw new Error(r.statusText);
            return r.json();
        })
        .then(() => {
            renameInputRow = null;
            refreshList();
        })
        .catch(err => {
            alert(T('rename_failed') + ': ' + err.message);
            renameInputRow = null;
            refreshList();
        });
}

function renameDirCancel() {
    renameInputRow = null;
    refreshList();
}

function showRenameFileInput(oldName) {
    if (renameInputRow || renameFileInputRow) return;
    renameFileInputRow = oldName;
    refreshList();
}

function renameFileInputKeydown(e, oldName) {
    if (e.key === 'Enter') {
        renameFileSave(e.target, oldName);
    }
}

function renameFileSave(input, oldName) {
    const newName = input.value.trim();
    if (!newName || newName === oldName) return;
    fetch(window.API_PREFIX + 'rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `from=${encodeURIComponent(oldName)}&to=${encodeURIComponent(newName)}&dir=${encodeURIComponent(curDir)}`
    })
        .then(r => {
            if (!r.ok) throw new Error(r.statusText);
            return r.json();
        })
        .then(() => {
            renameFileInputRow = null;
            refreshList();
        })
        .catch(err => {
            alert(T('rename_failed') + ': ' + err.message);
            renameFileInputRow = null;
            refreshList();
        });
}

function renameFileCancel() {
    renameFileInputRow = null;
    refreshList();
}

document.getElementById('upload-file-btn').addEventListener('click', function () {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.onchange = function () {
        for (const f of fileInput.files) uploadFile(f);
        hideUploadDropdown();
    };
    fileInput.click();
});

document.getElementById('upload-folder-btn').addEventListener('click', function () {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.webkitdirectory = true;
    fileInput.onchange = function () {
        for (const f of fileInput.files) {
            // file.webkitRelativePath contains the path starting from the folder name
            const path = f.webkitRelativePath;
            const dir = path.substring(0, path.lastIndexOf('/'));
            uploadFile(f, dir);
        }
        hideUploadDropdown();
    };
    fileInput.click();
});

function uploadFile(file, relativePath = "") {
    const taskId = addUploadTask(file);
    const xhr = new XMLHttpRequest();
    uploadTasks[taskId].xhr = xhr;

    let lastTime = new Date().getTime();
    let lastLoaded = 0;

    let uploadDir = curDir;
    if (relativePath) {
        uploadDir = curDir === "." ? relativePath : curDir + "/" + relativePath;
    }

    xhr.open('POST', window.API_PREFIX + 'upload');
    xhr.setRequestHeader('X-Upload-Dir', encodeURIComponent(uploadDir));
    xhr.setRequestHeader('X-Upload-Filename', encodeURIComponent(file.name));

    xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
            const now = new Date().getTime();
            const timeDiff = (now - lastTime) / 1000; // in seconds
            if (timeDiff > 0.5 || e.loaded === e.total) {
                const speed = timeDiff > 0 ? (e.loaded - lastLoaded) / timeDiff : 0;
                const speedText = formatSize(speed) + '/s';
                lastLoaded = e.loaded;
                lastTime = now;

                const item = document.getElementById(taskId);
                if (item) {
                    item.querySelector('.upload-speed').textContent = speedText;
                }
            }

            let percent = Math.floor((e.loaded / e.total) * 100);
            updateUploadProgress(taskId, percent, `${formatSize(e.loaded)} / ${formatSize(e.total)}`);
        }
    }
    xhr.onload = () => {
        updateUploadProgress(taskId, 100, T('upload_completed'));
        const item = document.getElementById(taskId);
        if (item) {
            item.querySelector('.upload-speed').textContent = T('finished');
        }
        delete uploadTasks[taskId].xhr;
        refreshList();
    }
    xhr.onerror = () => {
        updateUploadProgress(taskId, 0, T('upload_failed'));
        const item = document.getElementById(taskId);
        if (item) {
            item.querySelector('.upload-speed').textContent = T('error');
        }
        delete uploadTasks[taskId].xhr;
    }
    xhr.send(file);
}

const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const clearBtn = document.getElementById('clear-search-btn');

function updateClearBtn() {
    clearBtn.style.display = searchInput.value.trim() ? '' : 'none';
}
searchInput.addEventListener('input', updateClearBtn);
updateClearBtn();

searchBtn.addEventListener('click', function () {
    searchKeyword = searchInput.value.trim();
    refreshList();
});

searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
        searchKeyword = this.value.trim();
        refreshList();
    }
});

clearBtn.addEventListener('click', function () {
    searchInput.value = '';
    updateClearBtn();
    searchKeyword = '';
    refreshList();
    searchInput.focus();
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closeImagePreview();
        closePlayer();
    }
});

document.getElementById('image-preview-modal').addEventListener('click', function (e) {
    if (e.target === this) {
        closeImagePreview();
    }
});

function getFileIconClass(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (['ipk', 'apk'].includes(ext)) {
        return 'fa-solid fa-cube text-blue-400';
    }
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tif', 'tiff', 'avif'].includes(ext)) {
        return 'fa-regular fa-image text-blue-400';
    }
    if (['mp4', 'webm', 'ogv', 'mov', 'mkv', 'avi', 'flv', 'wmv', 'm4v', '3gp', 'ts'].includes(ext)) {
        return 'fa-solid fa-file-video text-purple-400';
    }
    if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'ape', 'amr'].includes(ext)) {
        return 'fa-solid fa-file-audio text-green-400';
    }
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'tbz2', 'zstd'].includes(ext)) {
        return 'fa-solid fa-file-zipper text-yellow-500';
    }
    if (['pdf'].includes(ext)) {
        return 'fa-solid fa-file-pdf text-red-500';
    }
    if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) {
        return 'fa-solid fa-file-word text-blue-600';
    }
    if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) {
        return 'fa-solid fa-file-excel text-green-700';
    }
    if (['ppt', 'pptx', 'odp'].includes(ext)) {
        return 'fa-solid fa-file-powerpoint text-orange-500';
    }
    if (['txt', 'md', 'log', 'ini', 'conf', 'json', 'yaml', 'yml'].includes(ext)) {
        return 'fa-solid fa-file-lines text-gray-400';
    }
    if (['js', 'ts', 'go', 'py', 'c', 'cpp', 'cc', 'cxx', 'hpp', 'hxx', 'h', 'java', 'cs', 'html', 'htm', 'php', 'rb', 'rs', 'swift', 'kt', 'kts', 'scala', 'pl', 'pm', 'lua', 'dart', 'toml', 'sh'].includes(ext)) {
        return 'fa-solid fa-file-code text-indigo-400';
    }
    return 'fa-regular fa-file text-gray-400';
}

let filenameAutoFilled = true;

function showDownloadUrlModal() {
    document.getElementById('download-url-modal').classList.remove('hidden');
    document.getElementById('download-url-input').value = "";
    document.getElementById('download-filename-input').value = "";
    document.getElementById('download-progress-bar').style.display = "none";
    document.getElementById('download-progress-inner').style.width = "0%";
    document.getElementById('download-progress-text').textContent = "";
    filenameAutoFilled = true;
    setTimeout(() => {
        document.addEventListener('mousedown', downloadModalClickOutside);
    });
}

document.addEventListener('DOMContentLoaded', function () {
    const urlInput = document.getElementById('download-url-input');
    const filenameInput = document.getElementById('download-filename-input');
    let filenameAutoFilled = true;

    if (urlInput && filenameInput) {
        urlInput.addEventListener('input', function () {
            if (filenameAutoFilled) {
                const urlVal = urlInput.value.trim();
                try {
                    let fakeUrl = urlVal;
                    if (!/^https?:\/\//i.test(fakeUrl)) fakeUrl = "http://" + fakeUrl;
                    const pathname = (new URL(fakeUrl)).pathname;
                    const parts = pathname.split('/');
                    let fname = parts.pop() || parts.pop() || '';
                    fname = decodeURIComponent(fname);
                    filenameInput.value = fname || "";
                } catch (e) {
                    filenameInput.value = "";
                }
            }
        });
        filenameInput.addEventListener('input', function () {
            filenameAutoFilled = false;
        });
    }
});

function closeDownloadUrlModal() {
    document.getElementById('download-url-modal').classList.add('hidden');
    document.removeEventListener('mousedown', downloadModalClickOutside);
}

function downloadModalClickOutside(e) {
    const modal = document.getElementById('download-url-modal');
    if (modal && e.target === modal) {
        closeDownloadUrlModal();
    }
}

let downloadUrlInterval = null;

function startDownloadUrl() {
    const url = document.getElementById('download-url-input').value.trim();
    const filename = document.getElementById('download-filename-input').value.trim();
    if (!url || !filename) {
        closeDownloadUrlModal();
        customAlertModal(T('fill_url_error'), T('error'));
        return;
    }

    document.getElementById('download-initial-buttons').style.display = 'none';
    document.getElementById('download-progress-buttons').style.display = '';

    const progressBar = document.getElementById('download-progress-bar');
    const progressInner = document.getElementById('download-progress-inner');
    const progressText = document.getElementById('download-progress-text');
    if (progressBar && progressInner && progressText) {
        progressBar.style.display = "";
        progressInner.style.width = "0%";
        progressText.textContent = T("prepare_download");
    } else {
        customAlertModal(T('operation_failed'), T('error'));
        return;
    }

    const formData = new URLSearchParams();
    formData.append('url', url);
    formData.append('filename', filename);
    formData.append('dir', curDir);

    fetch(window.API_PREFIX + 'download_url', {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString()
    }).then(res => res.json())
        .then(data => {
            if (data.success) {
                progressText.textContent = T("download_started");
                pollDownloadProgress(filename);
            } else {
                customAlertModal(T('download_task_failed'), T('error'));
                progressBar.style.display = "none";
                document.getElementById('download-initial-buttons').style.display = '';
                document.getElementById('download-progress-buttons').style.display = 'none';
            }
        });
}

function cancelDownload() {
    const filename = document.getElementById('download-filename-input').value.trim();
    if (!filename) {
        customAlertModal(T('operation_failed'), T('error'));
        return;
    }

    const formData = new URLSearchParams();
    formData.append('filename', filename);

    fetch(window.API_PREFIX + 'cancel_download', {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString()
    }).then(res => res.json())
        .then(data => {
            if (data.success) {
                customAlertModal(T('download_cancelled'), T('success'));
                closeDownloadUrlModal();
            } else {
                customAlertModal(T('cancel_download_failed'), T('error'));
            }
        }).catch(() => {
            customAlertModal(T('operation_failed'), T('error'));
        });
}

function closeDownloadUrlModal() {
    document.getElementById('download-url-modal').classList.add('hidden');
    document.removeEventListener('mousedown', downloadModalClickOutside);
    if (downloadUrlInterval) clearInterval(downloadUrlInterval);
    document.getElementById('download-initial-buttons').style.display = '';
    document.getElementById('download-progress-buttons').style.display = 'none';
    document.getElementById('download-progress-bar').style.display = 'none';
    document.getElementById('download-url-input').value = '';
    document.getElementById('download-filename-input').value = '';
}

function pollDownloadProgress(filename) {
    if (downloadUrlInterval) clearInterval(downloadUrlInterval);
    downloadUrlInterval = setInterval(() => {
        fetch(`${window.API_PREFIX}download_progress?filename=${encodeURIComponent(filename)}`)
            .then(res => {
                if (res.ok) return res.json();
                throw new Error('not found');
            })
            .then(progress => {
                let percent = progress.total > 0 ? ((progress.current / progress.total) * 100).toFixed(1) : 0;
                document.getElementById('download-progress-inner').style.width = percent + "%";
                document.getElementById('download-progress-text').textContent =
                    T('download_progress', { current: formatSize(progress.current), total: progress.total > 0 ? formatSize(progress.total) : "?", percent: percent });
                if (progress.done) {
                    clearInterval(downloadUrlInterval);
                    if (!progress.error) {
                        document.getElementById('download-progress-text').textContent = T("download_completed");
                        setTimeout(() => {
                            closeDownloadUrlModal();
                            refreshList();
                        }, 1000);
                    } else {
                        document.getElementById('download-progress-text').textContent = T('error') + ": " + progress.error;
                        document.getElementById('download-initial-buttons').style.display = '';
                        document.getElementById('download-progress-buttons').style.display = 'none';
                    }
                }
            })
            .catch(() => {
                clearInterval(downloadUrlInterval);
                refreshList();
                setTimeout(() => {
                    const fileExists = Array.from(document.querySelectorAll('[data-name]')).some(el => el.getAttribute('data-name') === filename);
                    if (fileExists) {
                        document.getElementById('download-progress-inner').style.width = "100%";
                        document.getElementById('download-progress-text').textContent = T("download_completed");
                        setTimeout(() => {
                            closeDownloadUrlModal();
                        }, 1000);
                    } else {
                        document.getElementById('download-progress-text').textContent = T("operation_failed");
                    }
                }, 500);
            });
    }, 800);
}

function toggleNewDropdown() {
    const menu = document.getElementById('new-dropdown-menu');
    menu.classList.toggle('hidden');
    if (!menu.classList.contains('hidden')) {
        document.addEventListener('mousedown', newDropdownClickOutside);
    }
}
function hideNewDropdown() {
    document.getElementById('new-dropdown-menu').classList.add('hidden');
    document.removeEventListener('mousedown', newDropdownClickOutside);
}
function newDropdownClickOutside(e) {
    const container = document.getElementById('new-dropdown-container');
    if (container && !container.contains(e.target)) {
        hideNewDropdown();
    }
}

function toggleUploadDropdown() {
    const menu = document.getElementById('upload-dropdown-menu');
    menu.classList.toggle('hidden');
    if (!menu.classList.contains('hidden')) {
        document.addEventListener('mousedown', uploadDropdownClickOutside);
    }
}
function hideUploadDropdown() {
    document.getElementById('upload-dropdown-menu').classList.add('hidden');
    document.removeEventListener('mousedown', uploadDropdownClickOutside);
}
function uploadDropdownClickOutside(e) {
    const container = document.getElementById('upload-dropdown-container');
    if (container && !container.contains(e.target)) {
        hideUploadDropdown();
    }
}

function setCtxBtnState(id, disabled) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.toggle('opacity-50', disabled);
    btn.classList.toggle('pointer-events-none', disabled);
}

function isArchiveFile(name) {
    return (
        name.endsWith('.zip') ||
        name.endsWith('.tar.gz') ||
        name.endsWith('.tar.xz') ||
        name.endsWith('.tgz')
    );
}

document.addEventListener('DOMContentLoaded', function () {
    const ctxMenu = document.getElementById('context-menu');
    const fileArea = document.getElementById('file-area');
    const fileTableBody = document.getElementById('file-table-body');
    const fileGridView = document.getElementById('file-grid-view');
    let ctxTargetType = 'area';

    function hideCtxMenu() {
        ctxMenu.classList.add('hidden');
    }

    fileTableBody.addEventListener('contextmenu', function (e) {
        let tr = e.target.closest('tr');
        if (tr && tr.hasAttribute('data-name')) {
            const checkbox = tr.querySelector('.batch-delete-checkbox');
            const isAlreadySelected = tr.classList.contains('bg-light');

            if (!isAlreadySelected) {
                document.querySelectorAll('.batch-delete-checkbox').forEach(cb => cb.checked = false);
                document.querySelectorAll('#file-table-body tr.bg-light').forEach(row => row.classList.remove('bg-light'));
                if (checkbox) {
                    checkbox.checked = true;
                    tr.classList.add('bg-light');
                }
            }
        }
        e.preventDefault();
        const checked = document.querySelectorAll('.batch-delete-checkbox:checked');
        ctxTargetType = checked.length > 0 ? 'file' : 'area';

        let disableDownload = checked.length !== 1;
        if (checked.length === 1) {
            const tr = checked[0].closest('tr');
            disableDownload = tr && tr.getAttribute('data-isdir') === '1';
        }

        setCtxBtnState('ctx-rename', checked.length !== 1);
        setCtxBtnState('ctx-chmod', checked.length !== 1);
        setCtxBtnState('ctx-properties', checked.length !== 1);
        setCtxBtnState('ctx-copy', ctxTargetType === 'area');
        setCtxBtnState('ctx-move', ctxTargetType === 'area');
        setCtxBtnState('ctx-compress-wrapper', ctxTargetType === 'area');
        setCtxBtnState('ctx-delete', ctxTargetType === 'area');
        setCtxBtnState('ctx-paste', !(clipboardFiles && clipboardFiles.length && clipboardDir));
        setCtxBtnState('ctx-download', disableDownload);

        const ctxDecompress = document.getElementById('ctx-decompress');
        if (ctxDecompress) {
            if (
                checked.length === 1 &&
                isArchiveFile(checked[0].getAttribute('data-name')) &&
                checked[0].closest('tr').getAttribute('data-isdir') !== '1'
            ) {
                ctxDecompress.classList.remove('opacity-50', 'pointer-events-none');
                ctxDecompress.disabled = false;
            } else {
                ctxDecompress.classList.add('opacity-50', 'pointer-events-none');
                ctxDecompress.disabled = true;
            }
        }

        // 智能定位右键菜单
        // 先让菜单可见但不可见于用户，用于测量高度宽度
        ctxMenu.style.visibility = 'hidden';
        ctxMenu.classList.remove('hidden');
        // 获取菜单尺寸
        const menuHeight = ctxMenu.offsetHeight;
        const menuWidth = ctxMenu.offsetWidth;
        const winHeight = window.innerHeight;
        const winWidth = window.innerWidth;

        let left = e.clientX;
        let top = e.clientY;

        // 水平方向溢出修正
        if (left + menuWidth > winWidth) {
            left = winWidth - menuWidth - 2;
            if (left < 0) left = 0;
        }
        // 垂直方向溢出修正
        if (top + menuHeight > winHeight) {
            top = top - menuHeight;
            if (top < 0) top = 0;
        }

        ctxMenu.style.left = left + 'px';
        ctxMenu.style.top = top + 'px';

        // 现在让菜单可见
        ctxMenu.style.visibility = 'visible';
        ctxMenu.classList.remove('hidden');
    });

    fileGridView.addEventListener('contextmenu', function (e) {
        let item = e.target.closest('.file-grid-item');
        if (item && item.hasAttribute('data-name')) {
            const isAlreadySelected = item.classList.contains('selected');

            if (!isAlreadySelected) {
                document.querySelectorAll('.file-grid-item.selected').forEach(item => {
                    item.classList.remove('selected');
                });
                document.querySelectorAll('.batch-delete-checkbox').forEach(cb => cb.checked = false);
                
                item.classList.add('selected');
                const checkbox = item.querySelector('.batch-delete-checkbox');
                if (checkbox) {
                    checkbox.checked = true;
                }
            }
        }
        e.preventDefault();
        const checked = document.querySelectorAll('.batch-delete-checkbox:checked');
        ctxTargetType = checked.length > 0 ? 'file' : 'area';

        let disableDownload = checked.length !== 1;
        if (checked.length === 1) {
            const item = checked[0].closest('.file-grid-item');
            disableDownload = item && item.getAttribute('data-isdir') === '1';
        }

        setCtxBtnState('ctx-rename', checked.length !== 1);
        setCtxBtnState('ctx-chmod', checked.length !== 1);
        setCtxBtnState('ctx-properties', checked.length !== 1);
        setCtxBtnState('ctx-copy', ctxTargetType === 'area');
        setCtxBtnState('ctx-move', ctxTargetType === 'area');
        setCtxBtnState('ctx-compress-wrapper', ctxTargetType === 'area');
        setCtxBtnState('ctx-delete', ctxTargetType === 'area');
        setCtxBtnState('ctx-paste', !(clipboardFiles && clipboardFiles.length && clipboardDir));
        setCtxBtnState('ctx-download', disableDownload);

        const ctxDecompress = document.getElementById('ctx-decompress');
        if (ctxDecompress) {
            if (
                checked.length === 1 &&
                isArchiveFile(checked[0].getAttribute('data-name')) &&
                checked[0].closest('.file-grid-item').getAttribute('data-isdir') !== '1'
            ) {
                ctxDecompress.classList.remove('opacity-50', 'pointer-events-none');
                ctxDecompress.disabled = false;
            } else {
                ctxDecompress.classList.add('opacity-50', 'pointer-events-none');
                ctxDecompress.disabled = true;
            }
        }

        ctxMenu.style.visibility = 'hidden';
        ctxMenu.classList.remove('hidden');
        const menuHeight = ctxMenu.offsetHeight;
        const menuWidth = ctxMenu.offsetWidth;
        const winHeight = window.innerHeight;
        const winWidth = window.innerWidth;

        let left = e.clientX;
        let top = e.clientY;

        if (left + menuWidth > winWidth) {
            left = winWidth - menuWidth - 2;
            if (left < 0) left = 0;
        }
        if (top + menuHeight > winHeight) {
            top = top - menuHeight;
            if (top < 0) top = 0;
        }

        ctxMenu.style.left = left + 'px';
        ctxMenu.style.top = top + 'px';

        ctxMenu.style.visibility = 'visible';
        ctxMenu.classList.remove('hidden');
    });


    fileArea.addEventListener('contextmenu', function (e) {
        if (e.target.closest('tbody tr') || e.target.closest('.file-grid-item')) return;
        e.preventDefault();
        ctxTargetType = 'area';
        setCtxBtnState('ctx-rename', true);
        setCtxBtnState('ctx-chmod', true);
        setCtxBtnState('ctx-copy', true);
        setCtxBtnState('ctx-move', true);
        setCtxBtnState('ctx-delete', true);
        setCtxBtnState('ctx-paste', !(clipboardFiles && clipboardFiles.length && clipboardDir));
        setCtxBtnState('ctx-download', true);
        ctxMenu.style.left = e.clientX + 'px';
        ctxMenu.style.top = e.clientY + 'px';
        ctxMenu.classList.remove('hidden');
    });

    document.addEventListener('click', function (e) {
        if (!ctxMenu.contains(e.target)) {
            hideCtxMenu();
        }
    });
    document.addEventListener('scroll', hideCtxMenu, true);
    window.addEventListener('resize', hideCtxMenu);

    const ctxMkdir = document.getElementById('ctx-mkdir');
    if (ctxMkdir) ctxMkdir.onclick = function () {
        hideCtxMenu();
        showMkdirInput();
    };
    const ctxCreatefile = document.getElementById('ctx-createfile');
    if (ctxCreatefile) ctxCreatefile.onclick = function () {
        hideCtxMenu();
        showCreateFileInput();
    };
    const ctxRename = document.getElementById('ctx-rename');
    if (ctxRename) ctxRename.onclick = function () {
        hideCtxMenu();
        const checked = document.querySelectorAll('.batch-delete-checkbox:checked');
        if (checked.length !== 1) {
            customAlert(T("select_one_error"));
            return;
        }
        const checkbox = checked[0];
        const name = checkbox.getAttribute('data-name');
        const parent = checkbox.closest('tr, .file-grid-item');
        const isDir = parent && parent.getAttribute('data-isdir') === '1';
        if (isDir) {
            showRenameInput(name);
        } else {
            showRenameFileInput(name);
        }
    };
    const ctxChmod = document.getElementById('ctx-chmod');
    if (ctxChmod) ctxChmod.onclick = function () {
        hideCtxMenu();
        const checked = document.querySelectorAll('.batch-delete-checkbox:checked');
        if (checked.length !== 1) {
            customAlert(T("select_one_error"));
            return;
        }
        const checkbox = checked[0];
        const name = checkbox.getAttribute('data-name');
        const parent = checkbox.closest('tr, .file-grid-item');
        const isDir = parent && parent.getAttribute('data-isdir') === '1';
        showChmodModal(name, isDir);
    };
    const ctxCopy = document.getElementById('ctx-copy');
    if (ctxCopy) ctxCopy.onclick = function () {
        hideCtxMenu();
        if (ctxTargetType === 'file') copyFiles();
    };
    const ctxMove = document.getElementById('ctx-move');
    if (ctxMove) ctxMove.onclick = function () {
        hideCtxMenu();
        if (ctxTargetType === 'file') moveFiles();
    };
    const ctxPaste = document.getElementById('ctx-paste');
    if (ctxPaste) ctxPaste.onclick = function () {
        hideCtxMenu();
        if (clipboardFiles && clipboardFiles.length && clipboardDir) pasteFiles();
    };
    const ctxDownload = document.getElementById('ctx-download');
    if (ctxDownload) ctxDownload.onclick = function () {
        hideCtxMenu();
        const checked = document.querySelectorAll('.batch-delete-checkbox:checked');
        checked.forEach(cb => {
            const item = cb.closest('tr, .file-grid-item');
            if (item && item.getAttribute('data-isdir') !== '1') {
                const name = cb.getAttribute('data-name');
                window.open(`${window.API_PREFIX}download?dir=${encodeURIComponent(curDir)}&name=${encodeURIComponent(name)}`, '_blank');
            }
        });
    };
    const ctxProperties = document.getElementById('ctx-properties');
    if (ctxProperties) ctxProperties.onclick = function () {
        hideCtxMenu();
        const checked = document.querySelectorAll('.batch-delete-checkbox:checked');
        if (checked.length === 1) {
            showProperties(checked[0].getAttribute('data-name'));
        }
    };
    const ctxDelete = document.getElementById('ctx-delete');
    if (ctxDelete) ctxDelete.onclick = function () {
        hideCtxMenu();
        if (ctxTargetType === 'file') batchDeleteFiles();
    };

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') hideCtxMenu();

        // Ctrl + X: Cut
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
            const target = e.target;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }
            moveFiles();
            e.preventDefault();
        }

        // Ctrl + C: Copy
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
            const target = e.target;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }
            copyFiles();
            e.preventDefault();
        }
    });
});

(function () {
    let dragCounter = 0;
    const fileArea = document.querySelector('.bg-white.rounded-lg.shadow-sm.overflow-hidden');
    document.addEventListener('dragenter', function (e) {
        dragCounter++;
        if (fileArea) fileArea.classList.add('file-drop-hover');
    });
    document.addEventListener('dragleave', function (e) {
        dragCounter--;
        if (dragCounter <= 0 && fileArea) fileArea.classList.remove('file-drop-hover');
    });
    document.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });
    document.addEventListener('drop', function (e) {
        e.preventDefault();
        dragCounter = 0;
        if (fileArea) fileArea.classList.remove('file-drop-hover');
        if (e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            for (const item of e.dataTransfer.items) {
                const entry = item.webkitGetAsEntry();
                if (entry) {
                    traverseFileTree(entry);
                }
            }
        } else if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            for (const f of e.dataTransfer.files) uploadFile(f);
        }
    });

    document.addEventListener('paste', function (e) {
        // If the focus is on an input or textarea, let the default paste happen
        const target = e.target;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            return;
        }

        // Priority 1: File Manager Internal Paste (Copy/Move)
        if (clipboardFiles && clipboardFiles.length > 0 && clipboardDir) {
            pasteFiles();
            e.preventDefault();
            return;
        }

        // Priority 2: Local File/Folder Upload
        let hasFiles = false;
        if (e.clipboardData && e.clipboardData.items && e.clipboardData.items.length > 0) {
            for (const item of e.clipboardData.items) {
                if (item.kind === 'file') {
                    const entry = item.webkitGetAsEntry();
                    if (entry) {
                        traverseFileTree(entry);
                        hasFiles = true;
                    }
                }
            }
        } else if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
            for (const f of e.clipboardData.files) {
                uploadFile(f);
                hasFiles = true;
            }
        }

        if (hasFiles) {
            e.preventDefault();
        }
    });
})();

function traverseFileTree(item, path = "") {
    if (item.isFile) {
        item.file(function (file) {
            uploadFile(file, path);
        });
    } else if (item.isDirectory) {
        const dirReader = item.createReader();
        const readEntries = () => {
            dirReader.readEntries(function (entries) {
                if (entries.length > 0) {
                    for (const entry of entries) {
                        traverseFileTree(entry, path ? path + "/" + item.name : item.name);
                    }
                    readEntries(); // Continue reading in case there are more than 100 entries
                }
            });
        };
        readEntries();
    }
}

function toggleArchiveDropdown() {
    const menu = document.getElementById('archive-dropdown-menu');
    menu.classList.toggle('hidden');
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#archive-dropdown-container')) {
            menu.classList.add('hidden');
        }
    }, { once: true });
}

let currentCompressFormat = "zip";

function hideCtxMenu() {
    const ctxMenu = document.getElementById('context-menu');
    if (ctxMenu) ctxMenu.classList.add('hidden');
}

function openCompressModal(format) {
    currentCompressFormat = format;
    const modal = document.getElementById('compress-modal');
    const input = document.getElementById('compress-name-input');

    let extension = format;
    if (format === 'tar.gz') extension = 'tar.gz';
    else if (format === 'tar.xz') extension = 'tar.xz';
    else extension = 'zip';

    input.value = `archive.${extension}`;
    modal.classList.remove('hidden');

    // 自动隐藏下拉菜单
    const dropdown = document.getElementById('archive-dropdown-menu');
    if (dropdown) dropdown.classList.add('hidden');
}

// 点击空白区域时关闭下拉菜单
window.addEventListener('click', function (e) {
    const dropdown = document.getElementById('archive-dropdown-menu');
    const btn = document.getElementById('archive-btn');
    if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});

function closeCompressModal() {
    document.getElementById('compress-modal').classList.add('hidden');
}

function startCompress() {
    const name = document.getElementById('compress-name-input').value.trim();
    if (!name) return alert(T('fill_url_error'));
    const paths = Array.from(document.querySelectorAll('.batch-delete-checkbox:checked')).map(cb => cb.dataset.name);
    if (!paths.length) return alert(T('paste_empty_error'));

    closeCompressModal();
    showProgressModal(T('compress'), T('please_wait'));

    fetch(window.API_PREFIX + 'compress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            paths,
            format: currentCompressFormat,
            target: name,
            workdir: curDir
        })
    })
        .then(res => res.json())
        .then(res => {
            if (res.success) {
                document.getElementById('progress-message').textContent = T('finished');
                document.getElementById('progress-ok').classList.remove('hidden');
                refreshList();
            } else {
                document.getElementById('progress-message').textContent = T('compress_failed');
                document.getElementById('progress-ok').classList.remove('hidden');
            }
        })
        .catch(() => {
            document.getElementById('progress-message').textContent = T('error');
            document.getElementById('progress-ok').classList.remove('hidden');
        });
}

function closeProgressModal() {
    document.getElementById('compress-progress-modal').classList.add('hidden');
    document.getElementById('progress-ok').classList.add('hidden');
}

function showProgressModal(title, message) {
    document.getElementById('progress-title').textContent = title;
    document.getElementById('progress-message').textContent = message;
    document.getElementById('progress-ok').classList.add('hidden');
    document.getElementById('compress-progress-modal').classList.remove('hidden');
}

// 属性弹窗逻辑
let currentPropPath = "";
let propEventSource = null;
let hashAbortController = null;

async function showProperties(name) {
    const modal = document.getElementById('properties-modal');
    const path = curDir === "." ? name : curDir + "/" + name;
    currentPropPath = path;

    // 重置状态
    if (propEventSource) propEventSource.close();
    if (hashAbortController) hashAbortController.abort();
    
    document.getElementById('prop-md5').classList.add('hidden');
    document.getElementById('md5-btn').classList.remove('hidden');
    document.getElementById('prop-sha256').classList.add('hidden');
    document.getElementById('sha256-btn').classList.remove('hidden');
    document.getElementById('prop-size').textContent = T('loading');
    document.getElementById('prop-contains').textContent = "";

    try {
        const res = await fetch(`${window.API_PREFIX}properties?path=${encodeURIComponent(path)}`);
        const data = await res.json();

        document.getElementById('prop-name').textContent = data.name;
        document.getElementById('prop-path').textContent = data.path;
        document.getElementById('prop-mod').textContent = data.mod_time;

        if (data.is_dir) {
            document.getElementById('prop-file-only').classList.add('hidden');
            document.getElementById('prop-hashes').classList.add('hidden');
            document.getElementById('prop-dir-only').classList.remove('hidden');
            
            // 使用 SSE 实时流式获取目录大小和数量
            propEventSource = new EventSource(`${window.API_PREFIX}properties_stream?path=${encodeURIComponent(path)}`);
            propEventSource.onmessage = (e) => {
                const streamData = JSON.parse(e.data);
                document.getElementById('prop-size').textContent = `${formatSize(streamData.size)} (${streamData.size.toLocaleString()} bytes)`;
                document.getElementById('prop-contains').textContent = `${streamData.files || 0} ${T('files_label')}, ${streamData.folders || 0} ${T('folders_label')}`;
                if (streamData.done) propEventSource.close();
            };
            propEventSource.onerror = () => propEventSource.close();
        } else {
            document.getElementById('prop-file-only').classList.remove('hidden');
            document.getElementById('prop-hashes').classList.remove('hidden');
            document.getElementById('prop-dir-only').classList.add('hidden');
            document.getElementById('prop-type').textContent = data.type;
            document.getElementById('prop-size').textContent = `${formatSize(data.size)} (${data.size.toLocaleString()} bytes)`;
        }

        modal.classList.remove('hidden');
    } catch (e) {
        customAlert(T('operation_failed'));
    }
}

function closePropertiesModal() {
    if (propEventSource) {
        propEventSource.close();
        propEventSource = null;
    }
    if (hashAbortController) {
        hashAbortController.abort();
        hashAbortController = null;
    }
    document.getElementById('properties-modal').classList.add('hidden');
}

async function calculateHash(algo) {
    const btn = document.getElementById(`${algo}-btn`);
    const span = document.getElementById(`prop-${algo}`);
    
    btn.classList.add('hidden');
    span.textContent = T('loading');
    span.classList.remove('hidden');

    if (hashAbortController) hashAbortController.abort();
    hashAbortController = new AbortController();

    try {
        const res = await fetch(`${window.API_PREFIX}hash?path=${encodeURIComponent(currentPropPath)}&algo=${algo}`, {
            signal: hashAbortController.signal
        });
        const data = await res.json();
        span.textContent = data.hash;
    } catch (e) {
        if (e.name === 'AbortError') return;
        span.textContent = T('error');
        btn.classList.remove('hidden');
    }
}

// 右键菜单绑定
document.addEventListener('DOMContentLoaded', () => {
    const ctxDecompress = document.getElementById('ctx-decompress');

    if (ctxDecompress) {
        ctxDecompress.onclick = () => {
            hideCtxMenu();
            const checked = document.querySelectorAll('.batch-delete-checkbox:checked');
            if (checked.length !== 1) {
                alert(T("paste_same_dir_error"));
                return;
            }
            const name = checked[0].getAttribute('data-name');
            decompressFile(name);
        };
    }
});

function handleCtxCompress(format) {
    hideCtxMenu();
    const checked = document.querySelectorAll('.batch-delete-checkbox:checked');
    if (checked.length === 0) {
        alert(T("paste_empty_error"));
        return;
    }
    openCompressModal(format);
}

function decompressFile(name) {
    showProgressModal(T('extract'), T('please_wait'));

    fetch(window.API_PREFIX + 'decompress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            archive: name,
            target: curDir
        })
    })
        .then(res => res.json())
        .then(res => {
            if (res.success) {
                document.getElementById('progress-message').textContent = T('finished');
                document.getElementById('progress-ok').classList.remove('hidden');
                refreshList();
            } else {
                document.getElementById('progress-message').textContent = T('decompress_failed');
                document.getElementById('progress-ok').classList.remove('hidden');
            }
        })
        .catch(() => {
            document.getElementById('progress-message').textContent = T('error');
            document.getElementById('progress-ok').classList.remove('hidden');
        });
}

document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        const tagName = e.target.tagName;
        const isInput = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || e.target.isContentEditable;

        const termModal = document.getElementById('terminal-modal');
        const isTermOpen = termModal && !termModal.classList.contains('hidden');
        const editorModal = document.getElementById('editor-modal');
        const isEditorOpen = editorModal && !editorModal.classList.contains('hidden');
        const playerModal = document.getElementById('player-modal');
        const isPlayerOpen = playerModal && !playerModal.classList.contains('hidden');
        const imageModal = document.getElementById('image-preview-modal');
        const isImageOpen = imageModal && !imageModal.classList.contains('hidden');

        if (!isInput && !isTermOpen && !isEditorOpen && !isPlayerOpen && !isImageOpen) {
            e.preventDefault();
            const all = document.querySelectorAll('.batch-delete-checkbox');
            if (all.length > 0) {
                all.forEach(cb => cb.checked = true);
                const headerCheckbox = document.getElementById('header-checkbox');
                if (headerCheckbox) headerCheckbox.checked = true;
                updateHeaderCheckbox();
            }
        }
    }
});

refreshList();