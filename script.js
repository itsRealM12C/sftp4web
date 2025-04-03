document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const connectBtn = document.getElementById('connect-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const hostInput = document.getElementById('host');
    const portInput = document.getElementById('port');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const fileList = document.getElementById('file-list').querySelector('tbody');
    const currentPath = document.getElementById('current-path');
    const homeBtn = document.getElementById('home-btn');
    const upBtn = document.getElementById('up-btn');
    const downloadBtn = document.getElementById('download-btn');
    const uploadBtn = document.getElementById('upload-btn');
    const fileUpload = document.getElementById('file-upload');
    const createFolderBtn = document.getElementById('create-folder-btn');
    const deleteBtn = document.getElementById('delete-btn');
    const renameBtn = document.getElementById('rename-btn');
    const statusMessage = document.getElementById('status-message');
    
    // Modal elements
    const folderModal = document.getElementById('folder-modal');
    const folderNameInput = document.getElementById('folder-name');
    const createFolderConfirm = document.getElementById('create-folder-confirm');
    const renameModal = document.getElementById('rename-modal');
    const newNameInput = document.getElementById('new-name');
    const renameConfirm = document.getElementById('rename-confirm');
    const closeButtons = document.querySelectorAll('.close');

    // State variables
    let selectedFile = null;
    let currentDirectory = '/';
    let connectionId = null;

    // Event listeners
    connectBtn.addEventListener('click', connectToSftp);
    disconnectBtn.addEventListener('click', disconnectFromSftp);
    homeBtn.addEventListener('click', () => navigateTo('/'));
    upBtn.addEventListener('click', navigateUp);
    downloadBtn.addEventListener('click', downloadFile);
    uploadBtn.addEventListener('click', () => fileUpload.click());
    fileUpload.addEventListener('change', uploadFile);
    createFolderBtn.addEventListener('click', showFolderModal);
    deleteBtn.addEventListener('click', deleteFile);
    renameBtn.addEventListener('click', showRenameModal);
    createFolderConfirm.addEventListener('click', createFolder);
    renameConfirm.addEventListener('click', renameFile);
    
    closeButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });

    // Close modal when clicking outside
    window.addEventListener('click', function(event) {
        if (event.target === folderModal) {
            folderModal.style.display = 'none';
        }
        if (event.target === renameModal) {
            renameModal.style.display = 'none';
        }
    });

    // Connect to SFTP server
    function connectToSftp() {
        const host = hostInput.value.trim();
        const port = portInput.value.trim() || 22;
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!host || !username || !password) {
            updateStatus('Please fill all connection fields', 'error');
            return;
        }

        updateStatus('Connecting...', 'info');

        fetch('/connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                host: host,
                port: port,
                username: username,
                password: password
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                connectionId = data.connection_id;
                updateStatus('Connected successfully', 'success');
                connectBtn.disabled = true;
                disconnectBtn.disabled = false;
                homeBtn.disabled = false;
                upBtn.disabled = false;
                uploadBtn.disabled = false;
                createFolderBtn.disabled = false;
                listFiles(currentDirectory);
            } else {
                updateStatus('Connection failed: ' + data.error, 'error');
            }
        })
        .catch(error => {
            updateStatus('Connection error: ' + error.message, 'error');
        });
    }

    // Disconnect from SFTP server
    function disconnectFromSftp() {
        if (!connectionId) return;

        updateStatus('Disconnecting...', 'info');

        fetch('/disconnect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                connection_id: connectionId
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                updateStatus('Disconnected successfully', 'success');
                connectionId = null;
                connectBtn.disabled = false;
                disconnectBtn.disabled = true;
                homeBtn.disabled = true;
                upBtn.disabled = true;
                downloadBtn.disabled = true;
                uploadBtn.disabled = true;
                createFolderBtn.disabled = true;
                deleteBtn.disabled = true;
                renameBtn.disabled = true;
                fileList.innerHTML = '';
                currentPath.textContent = '/';
            } else {
                updateStatus('Disconnection failed: ' + data.error, 'error');
            }
        })
        .catch(error => {
            updateStatus('Disconnection error: ' + error.message, 'error');
        });
    }

    // List files in directory
    function listFiles(path) {
        if (!connectionId) return;

        updateStatus('Loading directory...', 'info');

        fetch('/list', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                connection_id: connectionId,
                path: path
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                currentDirectory = path;
                currentPath.textContent = path;
                renderFileList(data.files);
                updateStatus('Directory loaded', 'success');
            } else {
                updateStatus('Failed to list files: ' + data.error, 'error');
            }
        })
        .catch(error => {
            updateStatus('Error listing files: ' + error.message, 'error');
        });
    }

    // Render file list
    function renderFileList(files) {
        fileList.innerHTML = '';
        
        // Add parent directory entry (except for root)
        if (currentDirectory !== '/') {
            const parentRow = document.createElement('tr');
            parentRow.innerHTML = `
                <td><i class="fas fa-folder"></i> ..</td>
                <td>-</td>
                <td>-</td>
                <td></td>
            `;
            parentRow.addEventListener('click', () => navigateUp());
            parentRow.style.cursor = 'pointer';
            fileList.appendChild(parentRow);
        }

        files.forEach(file => {
            const row = document.createElement('tr');
            
            const icon = file.type === 'directory' ? 
                '<i class="fas fa-folder"></i>' : 
                '<i class="fas fa-file"></i>';
            
            row.innerHTML = `
                <td>${icon} ${file.name}</td>
                <td>${file.type === 'directory' ? '-' : formatFileSize(file.size)}</td>
                <td>${new Date(file.mtime * 1000).toLocaleString()}</td>
                <td></td>
            `;
            
            row.addEventListener('click', () => {
                // Remove selection from all rows
                document.querySelectorAll('#file-list tr').forEach(r => {
                    r.classList.remove('selected');
                });
                
                // Add selection to current row
                row.classList.add('selected');
                selectedFile = file;
                
                // Enable/disable buttons based on selection
                downloadBtn.disabled = file.type === 'directory';
                deleteBtn.disabled = false;
                renameBtn.disabled = false;
            });
            
            // Double click to navigate into directories
            if (file.type === 'directory') {
                row.addEventListener('dblclick', () => {
                    const newPath = currentDirectory.endsWith('/') ? 
                        currentDirectory + file.name : 
                        currentDirectory + '/' + file.name;
                    navigateTo(newPath);
                });
            }
            
            fileList.appendChild(row);
        });
    }

    // Navigate to directory
    function navigateTo(path) {
        listFiles(path);
    }

    // Navigate up one directory
    function navigateUp() {
        if (currentDirectory === '/') return;
        
        const pathParts = currentDirectory.split('/').filter(part => part !== '');
        pathParts.pop();
        const newPath = pathParts.length > 0 ? '/' + pathParts.join('/') : '/';
        navigateTo(newPath);
    }

    // Download file
    function downloadFile() {
        if (!selectedFile || !connectionId) return;
        
        updateStatus('Downloading file...', 'info');
        
        fetch('/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                connection_id: connectionId,
                path: currentDirectory.endsWith('/') ? 
                    currentDirectory + selectedFile.name : 
                    currentDirectory + '/' + selectedFile.name
            })
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(data.error || 'Download failed');
                });
            }
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = selectedFile.name;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            updateStatus('File downloaded successfully', 'success');
        })
        .catch(error => {
            updateStatus('Download error: ' + error.message, 'error');
        });
    }

    // Upload file
    function uploadFile() {
        if (!connectionId || fileUpload.files.length === 0) return;
        
        const file = fileUpload.files[0];
        const formData = new FormData();
        formData.append('connection_id', connectionId);
        formData.append('path', currentDirectory);
        formData.append('file', file);
        
        updateStatus('Uploading file...', 'info');
        
        fetch('/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                updateStatus('File uploaded successfully', 'success');
                listFiles(currentDirectory);
                fileUpload.value = ''; // Reset file input
            } else {
                updateStatus('Upload failed: ' + data.error, 'error');
            }
        })
        .catch(error => {
            updateStatus('Upload error: ' + error.message, 'error');
        });
    }

    // Show folder creation modal
    function showFolderModal() {
        folderNameInput.value = '';
        folderModal.style.display = 'block';
    }

    // Create folder
    function createFolder() {
        const folderName = folderNameInput.value.trim();
        if (!folderName || !connectionId) return;
        
        const folderPath = currentDirectory.endsWith('/') ? 
            currentDirectory + folderName : 
            currentDirectory + '/' + folderName;
        
        updateStatus('Creating folder...', 'info');
        
        fetch('/mkdir', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                connection_id: connectionId,
                path: folderPath
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                updateStatus('Folder created successfully', 'success');
                folderModal.style.display = 'none';
                listFiles(currentDirectory);
            } else {
                updateStatus('Folder creation failed: ' + data.error, 'error');
            }
        })
        .catch(error => {
            updateStatus('Error creating folder: ' + error.message, 'error');
        });
    }

    // Delete file/folder
    function deleteFile() {
        if (!selectedFile || !connectionId) return;
        
        if (!confirm(`Are you sure you want to delete ${selectedFile.name}?`)) {
            return;
        }
        
        const fullPath = currentDirectory.endsWith('/') ? 
            currentDirectory + selectedFile.name : 
            currentDirectory + '/' + selectedFile.name;
        
        updateStatus('Deleting...', 'info');
        
        const endpoint = selectedFile.type === 'directory' ? '/rmdir' : '/remove';
        
        fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                connection_id: connectionId,
                path: fullPath
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                updateStatus('Deleted successfully', 'success');
                listFiles(currentDirectory);
                selectedFile = null;
                downloadBtn.disabled = true;
                deleteBtn.disabled = true;
                renameBtn.disabled = true;
            } else {
                updateStatus('Deletion failed: ' + data.error, 'error');
            }
        })
        .catch(error => {
            updateStatus('Error deleting: ' + error.message, 'error');
        });
    }

    // Show rename modal
    function showRenameModal() {
        if (!selectedFile) return;
        newNameInput.value = selectedFile.name;
        renameModal.style.display = 'block';
    }

    // Rename file/folder
    function renameFile() {
        const newName = newNameInput.value.trim();
        if (!newName || !selectedFile || !connectionId) return;
        
        const oldPath = currentDirectory.endsWith('/') ? 
            currentDirectory + selectedFile.name : 
            currentDirectory + '/' + selectedFile.name;
        
        const newPath = currentDirectory.endsWith('/') ? 
            currentDirectory + newName : 
            currentDirectory + '/' + newName;
        
        updateStatus('Renaming...', 'info');
        
        fetch('/rename', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                connection_id: connectionId,
                old_path: oldPath,
                new_path: newPath
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                updateStatus('Renamed successfully', 'success');
                renameModal.style.display = 'none';
                listFiles(currentDirectory);
                selectedFile = null;
                downloadBtn.disabled = true;
                deleteBtn.disabled = true;
                renameBtn.disabled = true;
            } else {
                updateStatus('Rename failed: ' + data.error, 'error');
            }
        })
        .catch(error => {
            updateStatus('Error renaming: ' + error.message, 'error');
        });
    }

    // Update status message
    function updateStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = '';
        statusMessage.classList.add(type);
    }

    // Format file size
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
});