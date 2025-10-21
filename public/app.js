class AITESTDOCApp {
    constructor() {
        this.selectedFiles = [];
        this.folderName = null;
        this.recentUploads = JSON.parse(localStorage.getItem('recentUploads') || '[]');
        this.uploadedFiles = []; // Store uploaded files with QR codes for email
        this.initializeElements();
        this.setupEventListeners();
        this.checkAuthStatus();
        this.displayRecentUploads();
        this.loadEmailHistory();
    }

    initializeElements() {
        this.dropArea = document.getElementById('dropArea');
        this.fileInput = document.getElementById('fileInput');
        this.folderInput = document.getElementById('folderInput');
        this.selectFilesBtn = document.getElementById('selectFilesBtn');
        this.selectFolderBtn = document.getElementById('selectFolderBtn');
        this.selectedFilesContainer = document.getElementById('selectedFiles');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.resultsContainer = document.getElementById('results');
        this.recentUploadsContainer = document.getElementById('recentUploads');
        this.loadingIndicator = document.querySelector('.loading');
        
        // Email elements
        this.recipientEmailInput = document.getElementById('recipientEmail');
        this.sendEmailBtn = document.getElementById('sendEmailBtn');
        
        // Debug: Check if elements are found
        console.log('Email elements found:', {
            recipientEmailInput: !!this.recipientEmailInput,
            sendEmailBtn: !!this.sendEmailBtn
        });
        this.emailLoadingIndicator = document.getElementById('emailLoading');
        this.emailStatusContainer = document.getElementById('emailStatus');
        
        // Email history modal elements
        this.emailHistoryBtn = document.getElementById('emailHistoryBtn');
        this.emailHistoryModal = document.getElementById('emailHistoryModal');
        this.closeEmailHistoryModal = document.getElementById('closeEmailHistoryModal');
        this.emailHistoryList = document.getElementById('emailHistoryList');
        this.selectAllEmailsBtn = document.getElementById('selectAllEmails');
        this.deselectAllEmailsBtn = document.getElementById('deselectAllEmails');
        this.resendSelectedEmailsBtn = document.getElementById('resendSelectedEmails');
    }

    setupEventListeners() {
        // File selection
        this.selectFilesBtn.addEventListener('click', () => {
            this.fileInput.click();
        });

        this.selectFolderBtn.addEventListener('click', () => {
            this.folderInput.click();
        });

        this.fileInput.addEventListener('change', (e) => {
            this.handleFileSelection(e.target.files);
        });

        this.folderInput.addEventListener('change', (e) => {
            this.handleFileSelection(e.target.files);
        });

        // Drag and drop
        this.dropArea.addEventListener('click', () => {
            this.fileInput.click();
        });

        this.dropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropArea.classList.add('dragover');
        });

        this.dropArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            this.dropArea.classList.remove('dragover');
        });

        this.dropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropArea.classList.remove('dragover');
            this.handleFileSelection(e.dataTransfer.files);
        });

        // Upload button
        this.uploadBtn.addEventListener('click', () => {
            this.uploadFiles();
        });

        // Email functionality
        this.recipientEmailInput.addEventListener('input', () => {
            this.updateSendEmailButton();
        });

        this.sendEmailBtn.addEventListener('click', () => {
            this.sendEmail();
        });

        // Email history modal
        this.emailHistoryBtn.addEventListener('click', () => {
            this.showEmailHistoryModal();
        });

        this.closeEmailHistoryModal.addEventListener('click', () => {
            this.hideEmailHistoryModal();
        });

        this.emailHistoryModal.addEventListener('click', (e) => {
            if (e.target === this.emailHistoryModal) {
                this.hideEmailHistoryModal();
            }
        });

        this.selectAllEmailsBtn.addEventListener('click', () => {
            this.selectAllEmailHistory(true);
        });

        this.deselectAllEmailsBtn.addEventListener('click', () => {
            this.selectAllEmailHistory(false);
        });

        this.resendSelectedEmailsBtn.addEventListener('click', () => {
            this.resendSelectedEmails();
        });

        // Upload mode change
        document.querySelectorAll('input[name="uploadMode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                this.updateUploadModeUI();
            });
        });
    }

    async checkAuthStatus() {
        try {
            const response = await fetch('/auth-status');
            const data = await response.json();
            
            if (!data.authorized) {
                this.showAuthorizationPrompt(data.authUrl);
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
        }
    }

    showAuthorizationPrompt(authUrl) {
        const authPrompt = document.createElement('div');
        authPrompt.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        authPrompt.innerHTML = `
            <div class="bg-white rounded-lg p-6 max-w-md mx-4">
                <h3 class="text-lg font-semibold mb-4">ต้องการการอนุญาต Google Drive</h3>
                <p class="text-gray-600 mb-4">กรุณาคลิกปุ่มด้านล่างเพื่ออนุญาตให้แอปพลิเคชันเข้าถึง Google Drive ของคุณ</p>
                <div class="flex space-x-3">
                    <a href="${authUrl}" target="_blank" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex-1 text-center">
                        อนุญาต Google Drive
                    </a>
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" class="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-lg">
                        ปิด
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(authPrompt);
    }

    handleFileSelection(files) {
        const validFiles = Array.from(files).filter(file => {
            const allowedTypes = ['application/pdf', 'application/msword', 
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'image/png', 'image/jpeg', 'image/jpg'];
            return allowedTypes.includes(file.type) || 
                   ['.pdf', '.doc', '.docx', '.png', '.jpeg', '.jpg'].includes(
                       file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
                   );
        });

        if (validFiles.length !== files.length) {
            this.showNotification('บางไฟล์ไม่รองรับและถูกข้าม', 'warning');
        }

        // Extract folder name from first file's webkitRelativePath if available
        if (validFiles.length > 0 && validFiles[0].webkitRelativePath) {
            const pathParts = validFiles[0].webkitRelativePath.split('/');
            if (pathParts.length > 1) {
                this.folderName = pathParts[0]; // Get the root folder name
            }
        }

        this.selectedFiles = [...this.selectedFiles, ...validFiles];
        this.displaySelectedFiles();
        this.updateUploadButton();
    }

    displaySelectedFiles() {
        this.selectedFilesContainer.innerHTML = '';
        
        if (this.selectedFiles.length === 0) {
            return;
        }

        // Show folder name if available
        if (this.folderName) {
            const folderInfo = document.createElement('div');
            folderInfo.className = 'p-3 bg-blue-50 rounded-lg mb-3 border-l-4 border-blue-500';
            folderInfo.innerHTML = `
                <div class="flex items-center">
                    <i class="fas fa-folder text-blue-500 mr-2"></i>
                    <span class="font-medium text-blue-700">โฟลเดอร์: ${this.folderName}</span>
                </div>
            `;
            this.selectedFilesContainer.appendChild(folderInfo);
        }

        this.selectedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item flex items-center justify-between p-3 bg-gray-50 rounded-lg';
            
            const fileIcon = this.getFileIcon(file.type || file.name);
            const fileSize = this.formatFileSize(file.size);
            
            // Show checkbox only if there are multiple files
            const showCheckbox = this.selectedFiles.length > 1;
            const isChecked = file.selected !== false; // Default to true if not set
            
            fileItem.innerHTML = `
                <div class="flex items-center">
                    ${showCheckbox ? `
                        <input type="checkbox" 
                               id="file-${index}" 
                               class="mr-3 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" 
                               ${isChecked ? 'checked' : ''}
                               onchange="window.aitestdocApp.toggleFileSelection(${index})">
                    ` : ''}
                    <i class="${fileIcon} text-lg mr-3"></i>
                    <div>
                        <p class="font-medium text-gray-800">${file.name}</p>
                        <p class="text-sm text-gray-500">${fileSize}</p>
                    </div>
                </div>
                <button onclick="window.aitestdocApp.removeFile(${index})" class="text-red-500 hover:text-red-700">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            this.selectedFilesContainer.appendChild(fileItem);
        });

        // Add select all/none buttons if there are multiple files
        if (this.selectedFiles.length > 1) {
            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'flex justify-between items-center mt-3 p-2 bg-gray-100 rounded-lg';
            controlsDiv.innerHTML = `
                <div class="flex space-x-2">
                    <button onclick="window.aitestdocApp.selectAllFiles()" class="text-sm bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded">
                        <i class="fas fa-check-square mr-1"></i>เลือกทั้งหมด
                    </button>
                    <button onclick="window.aitestdocApp.selectNoFiles()" class="text-sm bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded">
                        <i class="fas fa-square mr-1"></i>ไม่เลือกทั้งหมด
                    </button>
                </div>
                <span class="text-sm text-gray-600">เลือกแล้ว: <span id="selectedCount">${this.getSelectedFilesCount()}</span>/${this.selectedFiles.length} ไฟล์</span>
            `;
            this.selectedFilesContainer.appendChild(controlsDiv);
        }
    }

    removeFile(index) {
        this.selectedFiles.splice(index, 1);
        this.displaySelectedFiles();
        this.updateUploadButton();
    }

    updateUploadButton() {
        const selectedCount = this.getSelectedFilesCount();
        this.uploadBtn.disabled = selectedCount === 0;
    }

    toggleFileSelection(index) {
        if (this.selectedFiles[index]) {
            this.selectedFiles[index].selected = !this.selectedFiles[index].selected;
            this.updateSelectedCount();
            this.updateUploadButton();
        }
    }

    selectAllFiles() {
        this.selectedFiles.forEach(file => {
            file.selected = true;
        });
        this.displaySelectedFiles();
        this.updateUploadButton();
    }

    selectNoFiles() {
        this.selectedFiles.forEach(file => {
            file.selected = false;
        });
        this.displaySelectedFiles();
        this.updateUploadButton();
    }

    getSelectedFilesCount() {
        if (this.selectedFiles.length <= 1) {
            return this.selectedFiles.length;
        }
        return this.selectedFiles.filter(file => file.selected !== false).length;
    }

    getSelectedFiles() {
        if (this.selectedFiles.length <= 1) {
            return this.selectedFiles;
        }
        return this.selectedFiles.filter(file => file.selected !== false);
    }

    updateSelectedCount() {
        const countElement = document.getElementById('selectedCount');
        if (countElement) {
            countElement.textContent = this.getSelectedFilesCount();
        }
    }

    updateUploadModeUI() {
        const uploadMode = document.querySelector('input[name="uploadMode"]:checked').value;
        const modeInfo = document.querySelector('.upload-mode-info');
        
        if (modeInfo) {
            modeInfo.remove();
        }

        if (this.selectedFiles.length > 1) {
            const info = document.createElement('div');
            info.className = 'upload-mode-info mt-2 p-2 bg-blue-50 rounded text-sm text-blue-700';
            
            const selectedCount = this.getSelectedFilesCount();
            
            if (uploadMode === 'combined') {
                info.textContent = `ไฟล์ที่เลือก ${selectedCount} ไฟล์จะถูกรวมเป็น PDF เดียว และมี QR Code เดียว`;
            } else {
                info.textContent = `ไฟล์ที่เลือก ${selectedCount} ไฟล์จะได้ QR Code แยกกัน`;
            }
            
            this.selectedFilesContainer.appendChild(info);
        }
    }

    async uploadFiles() {
        const filesToUpload = this.getSelectedFiles();
        if (filesToUpload.length === 0) return;

        this.setLoading(true);
        
        try {
            const formData = new FormData();
            const uploadMode = document.querySelector('input[name="uploadMode"]:checked').value;
            
            filesToUpload.forEach(file => {
                formData.append('files', file);
            });
            formData.append('uploadMode', uploadMode);
            
            // Add folder name if available
            if (this.folderName) {
                formData.append('folderName', this.folderName);
            }

            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                this.displayResults(result.results);
                this.addToRecentUploads(result.results);
                this.clearSelectedFiles();
                this.showNotification('อัปโหลดไฟล์สำเร็จ!', 'success');
            } else {
                throw new Error(result.error || 'เกิดข้อผิดพลาดในการอัปโหลด');
            }
        } catch (error) {
            console.error('Upload error:', error);
            this.showNotification(error.message, 'error');
        } finally {
            this.setLoading(false);
        }
    }

    displayResults(results) {
        this.resultsContainer.innerHTML = '';
        
        // Store uploaded files for email functionality
        this.uploadedFiles = results;
        this.updateSendEmailButton();
        
        results.forEach(result => {
            const resultItem = document.createElement('div');
            resultItem.className = 'result-item p-4 border rounded-lg bg-gray-50';
            
            resultItem.innerHTML = `
                <div class="flex flex-col items-center text-center">
                    <h3 class="font-semibold text-gray-800 mb-2">${result.fileName}</h3>
                    <img src="${result.qrCode}" alt="QR Code" class="mb-3 border rounded">
                    <div class="space-y-2 w-full">
                        <a href="${result.viewUrl}" target="_blank" 
                           class="block bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm transition duration-200">
                            <i class="fas fa-eye mr-2"></i>ดูไฟล์
                        </a>
                        <a href="${result.downloadUrl}" target="_blank"
                           class="block bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm transition duration-200">
                            <i class="fas fa-download mr-2"></i>ดาวน์โหลดไฟล์
                        </a>
                        <button onclick="window.aitestdocApp.copyToClipboard('${result.viewUrl}')"
                                class="w-full bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition duration-200">
                            <i class="fas fa-copy mr-2"></i>คัดลอกลิงก์
                        </button>
                        <button onclick="window.aitestdocApp.downloadQRCode('${result.qrCode}', '${result.fileName}')"
                                class="w-full bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg text-sm transition duration-200">
                            <i class="fas fa-qrcode mr-2"></i>ดาวน์โหลด QR Code
                        </button>
                    </div>
                </div>
            `;
            
            this.resultsContainer.appendChild(resultItem);
        });
    }

    addToRecentUploads(results) {
        const uploads = results.map(result => ({
            ...result,
            uploadTime: new Date().toISOString()
        }));
        
        this.recentUploads = [...uploads, ...this.recentUploads].slice(0, 10);
        localStorage.setItem('recentUploads', JSON.stringify(this.recentUploads));
        this.displayRecentUploads();
    }

    displayRecentUploads() {
        if (this.recentUploads.length === 0) {
            this.recentUploadsContainer.innerHTML = '<p class="text-gray-500 text-center py-4">ยังไม่มีไฟล์ที่อัปโหลด</p>';
            return;
        }

        this.recentUploadsContainer.innerHTML = '';
        
        this.recentUploads.forEach(upload => {
            const uploadItem = document.createElement('div');
            uploadItem.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-lg';
            
            const uploadTime = new Date(upload.uploadTime).toLocaleString('th-TH');
            
            uploadItem.innerHTML = `
                <div class="flex items-center">
                    <i class="${this.getFileIcon(upload.fileName)} text-lg mr-3"></i>
                    <div>
                        <p class="font-medium text-gray-800">${upload.fileName}</p>
                        <p class="text-sm text-gray-500">${uploadTime}</p>
                    </div>
                </div>
                <div class="flex space-x-2">
                    <a href="${upload.viewUrl}" target="_blank" class="text-blue-500 hover:text-blue-700" title="ดูไฟล์">
                        <i class="fas fa-eye"></i>
                    </a>
                    <button onclick="window.aitestdocApp.copyToClipboard('${upload.viewUrl}')" class="text-gray-500 hover:text-gray-700" title="คัดลอกลิงก์">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button onclick="window.aitestdocApp.downloadQRCode('${upload.qrCode}', '${upload.fileName}')" class="text-green-500 hover:text-green-700" title="ดาวน์โหลด QR Code">
                        <i class="fas fa-download"></i>
                    </button>
                </div>
            `;
            
            this.recentUploadsContainer.appendChild(uploadItem);
        });
    }

    clearSelectedFiles() {
        this.selectedFiles = [];
        this.folderName = null;
        this.fileInput.value = '';
        this.displaySelectedFiles();
        this.updateUploadButton();
    }

    setLoading(loading) {
        if (loading) {
            this.loadingIndicator.classList.add('active');
            this.uploadBtn.disabled = true;
        } else {
            this.loadingIndicator.classList.remove('active');
            this.updateUploadButton();
        }
    }

    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showNotification('คัดลอกลิงก์สำเร็จ!', 'success');
        } catch (error) {
            console.error('Error copying to clipboard:', error);
            this.showNotification('ไม่สามารถคัดลอกลิงก์ได้', 'error');
        }
    }

    downloadQRCode(qrCodeDataUrl, fileName) {
        try {
            // Create a temporary link element
            const link = document.createElement('a');
            link.href = qrCodeDataUrl;
            
            // Generate filename for QR code
            const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
            link.download = `QR-${fileNameWithoutExt}.png`;
            
            // Trigger download
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.showNotification('ดาวน์โหลด QR Code สำเร็จ!', 'success');
        } catch (error) {
            console.error('Error downloading QR code:', error);
            this.showNotification('ไม่สามารถดาวน์โหลด QR Code ได้', 'error');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 p-4 rounded-lg text-white z-50 ${
            type === 'success' ? 'bg-green-500' :
            type === 'error' ? 'bg-red-500' :
            type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
        }`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    getFileIcon(fileType) {
        if (fileType.includes('pdf')) return 'fas fa-file-pdf text-red-500';
        if (fileType.includes('word') || fileType.includes('doc')) return 'fas fa-file-word text-blue-500';
        if (fileType.includes('image') || fileType.includes('png') || fileType.includes('jpeg') || fileType.includes('jpg')) return 'fas fa-file-image text-green-500';
        if (fileType.includes('zip')) return 'fas fa-file-archive text-purple-500';
        return 'fas fa-file text-gray-500';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Email functionality methods
    updateSendEmailButton() {
        const hasEmail = this.recipientEmailInput.value.trim() !== '';
        const hasUploadedFiles = this.uploadedFiles && this.uploadedFiles.length > 0;
        const isValidEmail = this.isValidEmail(this.recipientEmailInput.value.trim());
        
        this.sendEmailBtn.disabled = !(hasEmail && hasUploadedFiles && isValidEmail);
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    async sendEmail() {
        const recipientEmail = this.recipientEmailInput.value.trim();
        
        if (!recipientEmail || !this.uploadedFiles || this.uploadedFiles.length === 0) {
            this.showNotification('กรุณากรอกอีเมลและอัปโหลดไฟล์ก่อน', 'error');
            return;
        }

        try {
            this.setEmailLoading(true);
            this.showEmailStatus(`กำลังส่งอีเมล ${this.uploadedFiles.length} ไฟล์...`, 'info');

            // Send emails for all uploaded files
            const emailPromises = this.uploadedFiles.map(async (file) => {
                const response = await fetch('/send-email', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        recipientEmail: recipientEmail,
                        fileName: file.fileName,
                        qrCodeDataUrl: file.qrCode
                    })
                });

                const result = await response.json();
                return { ...result, fileName: file.fileName };
            });

            const results = await Promise.all(emailPromises);
            
            const successCount = results.filter(r => r.success).length;
            const failCount = results.length - successCount;

            if (successCount > 0) {
                this.showEmailStatus(`ส่งอีเมลสำเร็จ ${successCount} ไฟล์${failCount > 0 ? `, ล้มเหลว ${failCount} ไฟล์` : ''}!`, 'success');
                this.showNotification(`ส่งอีเมลสำเร็จ ${successCount} ไฟล์${failCount > 0 ? `, ล้มเหลว ${failCount} ไฟล์` : ''}!`, 'success');
                
                // Clear form
                this.recipientEmailInput.value = '';
                this.updateSendEmailButton();
                
                // Save to localStorage and refresh email history
                results.forEach(result => {
                    if (result.success && result.emailRecord) {
                        this.saveEmailToLocalStorage(result.emailRecord);
                    }
                });
                this.loadEmailHistory();
            } else {
                this.showEmailStatus('ส่งอีเมลล้มเหลวทั้งหมด', 'error');
                this.showNotification('ส่งอีเมลล้มเหลวทั้งหมด', 'error');
            }

        } catch (error) {
            console.error('Send email error:', error);
            this.showEmailStatus('เกิดข้อผิดพลาดในการส่งอีเมล', 'error');
            this.showNotification('เกิดข้อผิดพลาดในการส่งอีเมล', 'error');
        } finally {
            this.setEmailLoading(false);
        }
    }

    setEmailLoading(loading) {
        if (loading) {
            this.emailLoadingIndicator.classList.remove('hidden');
            this.sendEmailBtn.disabled = true;
        } else {
            this.emailLoadingIndicator.classList.add('hidden');
            this.updateSendEmailButton();
        }
    }

    showEmailStatus(message, type) {
        this.emailStatusContainer.classList.remove('hidden');
        this.emailStatusContainer.className = `p-3 rounded-lg text-sm ${
            type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' :
            type === 'error' ? 'bg-red-100 text-red-800 border border-red-200' :
            'bg-blue-100 text-blue-800 border border-blue-200'
        }`;
        this.emailStatusContainer.textContent = message;

        // Auto hide after 5 seconds
        setTimeout(() => {
            this.emailStatusContainer.classList.add('hidden');
        }, 5000);
    }

    async loadEmailHistory() {
        try {
            // Load from localStorage first
            const localHistory = JSON.parse(localStorage.getItem('emailHistory') || '[]');
            
            // Then load from server
            const response = await fetch('/email-history?limit=20');
            const result = await response.json();

            if (result.success) {
                // Merge server and local history, remove duplicates
                const mergedHistory = [...result.history, ...localHistory]
                    .filter((item, index, self) => 
                        index === self.findIndex(t => t.id === item.id)
                    )
                    .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
                    .slice(0, 50); // Keep only 50 most recent
                
                this.displayEmailHistory(mergedHistory);
            } else {
                this.displayEmailHistory(localHistory);
            }
        } catch (error) {
            console.error('Error loading email history:', error);
            // Fallback to localStorage only
            const localHistory = JSON.parse(localStorage.getItem('emailHistory') || '[]');
            this.displayEmailHistory(localHistory);
        }
    }

    displayEmailHistory(history) {
        if (history.length === 0) {
            this.emailHistoryList.innerHTML = '<p class="text-gray-500 text-center py-8">ยังไม่มีประวัติการส่งอีเมล</p>';
            return;
        }

        this.emailHistoryList.innerHTML = '';
        
        history.forEach((record, index) => {
            const historyItem = document.createElement('div');
            historyItem.className = `p-3 bg-gray-50 rounded-lg border-l-4 ${
                record.status === 'sent' ? 'border-green-500' : 'border-red-500'
            }`;
            
            const sentDate = new Date(record.sentAt).toLocaleString('th-TH');
            
            historyItem.innerHTML = `
                <div class="flex items-start space-x-3">
                    <input type="checkbox" class="email-checkbox mt-1" data-index="${index}" data-email="${record.recipientEmail}" data-filename="${record.fileName}">
                    <div class="flex-1">
                        <div class="flex items-center space-x-2">
                            <div class="text-sm font-medium text-gray-800">${record.recipientEmail}</div>
                            <button class="copy-email-btn text-blue-500 hover:text-blue-700 text-xs" data-email="${record.recipientEmail}" title="คัดลอกอีเมล">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                        <div class="text-xs text-gray-600">${record.fileName}</div>
                        <div class="text-xs text-gray-500">${sentDate}</div>
                        ${record.error ? `<div class="text-xs text-red-600 mt-1">${record.error}</div>` : ''}
                    </div>
                    <div class="ml-2">
                        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            record.status === 'sent' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                        }">
                            <i class="fas ${record.status === 'sent' ? 'fa-check' : 'fa-times'} mr-1"></i>
                            ${record.status === 'sent' ? 'ส่งแล้ว' : 'ล้มเหลว'}
                        </span>
                    </div>
                </div>
            `;
            
            this.emailHistoryList.appendChild(historyItem);
        });

        // Add event listeners to checkboxes
        this.emailHistoryList.querySelectorAll('.email-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateResendButton();
            });
        });

        // Add event listeners to copy buttons
        this.emailHistoryList.querySelectorAll('.copy-email-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                this.copyEmailToClipboard(button.dataset.email);
            });
        });
    }

    showEmailHistoryModal() {
        this.loadEmailHistory();
        this.emailHistoryModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    hideEmailHistoryModal() {
        this.emailHistoryModal.classList.add('hidden');
        document.body.style.overflow = 'auto';
    }

    selectAllEmailHistory(select) {
        const checkboxes = this.emailHistoryList.querySelectorAll('.email-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = select;
        });
        this.updateResendButton();
    }

    updateResendButton() {
        const checkedBoxes = this.emailHistoryList.querySelectorAll('.email-checkbox:checked');
        this.resendSelectedEmailsBtn.disabled = checkedBoxes.length === 0;
    }

    async resendSelectedEmails() {
        const checkedBoxes = this.emailHistoryList.querySelectorAll('.email-checkbox:checked');
        
        if (checkedBoxes.length === 0) {
            this.showNotification('กรุณาเลือกอีเมลที่ต้องการส่งอีกครั้ง', 'warning');
            return;
        }

        const emailsToResend = Array.from(checkedBoxes).map(checkbox => ({
            email: checkbox.dataset.email,
            fileName: checkbox.dataset.filename
        }));

        // Find the corresponding QR codes from uploaded files
        const resendPromises = emailsToResend.map(async (item) => {
            // Find the file with matching name in uploaded files
            const matchingFile = this.uploadedFiles.find(file => file.fileName === item.fileName);
            
            if (!matchingFile) {
                console.warn(`QR Code not found for file: ${item.fileName}`);
                return { success: false, email: item.email, error: 'ไม่พบ QR Code สำหรับไฟล์นี้' };
            }

            try {
                const response = await fetch('/send-email', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        recipientEmail: item.email,
                        fileName: item.fileName,
                        qrCodeDataUrl: matchingFile.qrCode
                    })
                });

                const result = await response.json();
                return { ...result, email: item.email, fileName: item.fileName };
            } catch (error) {
                return { success: false, email: item.email, fileName: item.fileName, error: error.message };
            }
        });

        try {
            this.resendSelectedEmailsBtn.disabled = true;
            this.resendSelectedEmailsBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>กำลังส่ง...';

            const results = await Promise.all(resendPromises);
            
            const successCount = results.filter(r => r.success).length;
            const failCount = results.length - successCount;

            if (successCount > 0) {
                this.showNotification(`ส่งอีเมลสำเร็จ ${successCount} รายการ${failCount > 0 ? `, ล้มเหลว ${failCount} รายการ` : ''}`, 'success');
            } else {
                this.showNotification('ส่งอีเมลล้มเหลวทั้งหมด', 'error');
            }

            // Refresh email history
            this.loadEmailHistory();
            
            // Uncheck all checkboxes
            this.selectAllEmailHistory(false);

        } catch (error) {
            console.error('Resend emails error:', error);
            this.showNotification('เกิดข้อผิดพลาดในการส่งอีเมล', 'error');
        } finally {
            this.resendSelectedEmailsBtn.disabled = false;
            this.resendSelectedEmailsBtn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>ส่งอีกครั้ง';
        }
    }

    copyEmailToClipboard(email) {
        navigator.clipboard.writeText(email).then(() => {
            this.showNotification(`คัดลอกอีเมล ${email} แล้ว`, 'success');
        }).catch(err => {
            console.error('Failed to copy email:', err);
            this.showNotification('ไม่สามารถคัดลอกได้', 'error');
        });
    }

    saveEmailToLocalStorage(emailRecord) {
        try {
            const localHistory = JSON.parse(localStorage.getItem('emailHistory') || '[]');
            localHistory.unshift(emailRecord);
            
            // Keep only last 100 emails
            const trimmedHistory = localHistory.slice(0, 100);
            localStorage.setItem('emailHistory', JSON.stringify(trimmedHistory));
        } catch (error) {
            console.error('Error saving to localStorage:', error);
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.aitestdocApp = new AITESTDOCApp();
});
