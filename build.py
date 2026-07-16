import os
import shutil
import zipfile

def build():
    cwd = os.getcwd()
    dist_dir = os.path.join(cwd, "focus_lock_dist")
    zip_filename = os.path.join(cwd, "focus-lock-v1.0.0.zip")

    # 1. Clean old dist and old zip
    if os.path.exists(dist_dir):
        shutil.rmtree(dist_dir)
    if os.path.exists(zip_filename):
        os.remove(zip_filename)

    os.makedirs(dist_dir)

    # 2. Copy allowed files & folders
    folders_to_copy = ["modules", "siteFilters", "icons"]
    for folder in folders_to_copy:
        src = os.path.join(cwd, folder)
        dst = os.path.join(dist_dir, folder)
        if os.path.exists(src):
            shutil.copytree(src, dst)

    root_files = [
        "background.js", "content.css", "content.js", "intention.css", "intention.html",
        "intention.js", "manifest.json", "popup.css", "popup.html", "popup.js",
        "report.html", "report.js", "warning.css", "warning.html",
        "warning.js", "youtube-content.css"
    ]

    for file in root_files:
        src = os.path.join(cwd, file)
        dst = os.path.join(dist_dir, file)
        if os.path.exists(src):
            shutil.copy2(src, dst)

    # Helper to load, clean endings, replace text, and save
    def strip_block(filepath, block_to_remove):
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Normalize to LF line endings for consistent replacement
        normalized_content = content.replace('\r\n', '\n')
        normalized_block = block_to_remove.replace('\r\n', '\n')
        
        if normalized_block in normalized_content:
            new_content = normalized_content.replace(normalized_block, '')
            # Write back with original platform line endings
            with open(filepath, 'w', encoding='utf-8', newline='') as f:
                f.write(new_content)
            print(f"Successfully stripped developer block from {os.path.basename(filepath)}")
        else:
            print(f"Warning: Developer block not found in {os.path.basename(filepath)}")

    # 3. Strip Developer Tools from popup.html
    DEV_TOOLS_HTML = """        <!-- Sample Mock Data Generator -->
        <div id="devToolsGroup" class="settings-group">
          <label class="group-label">Developer Tools</label>
          <p class="settings-desc">Populate demo data to inspect insights and evolution reports.</p>
          <button id="btnGenMockData" class="btn-primary-sage" style="width: 100%;">
            <svg class="btn-icon-svg" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="3" rx="2" ry="2"/><rect width="20" height="8" x="2" y="13" rx="2" ry="2"/><line x1="6" y1="7" x2="6.01" y2="7"/><line x1="6" y1="17" x2="6.01" y2="17"/></svg>
            <span>Generate Sample Focus Data</span>
          </button>
        </div>"""
    strip_block(os.path.join(dist_dir, "popup.html"), DEV_TOOLS_HTML)

    # 4. Strip Developer Tools event listener from popup.js
    DEV_TOOLS_JS = """  if (btnGenMockData) {
    if (!SHOW_DEV_TOOLS) {
      btnGenMockData.style.display = 'none';
    }
    btnGenMockData.addEventListener('click', () => {
      if (!SHOW_DEV_TOOLS) return;
      btnGenMockData.disabled = true;
      btnGenMockData.textContent = 'Generating...';
      chrome.runtime.sendMessage({ action: 'generateMockData' }, (res) => {
        if (chrome.runtime.lastError) {
          console.warn('generateMockData message error:', chrome.runtime.lastError.message);
        }
        if (res && res.success) {
          alert('Demo focus data generated successfully!');
          window.location.reload();
        } else {
          alert(res ? res.error : 'Failed to generate demo data');
          btnGenMockData.disabled = false;
          btnGenMockData.innerHTML = `
            <svg class="btn-icon-svg" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="3" rx="2" ry="2"/><rect width="20" height="8" x="2" y="13" rx="2" ry="2"/><line x1="6" y1="7" x2="6.01" y2="7"/><line x1="6" y1="17" x2="6.01" y2="17"/></svg>
            <span>Generate Sample Focus Data</span>
          `;
        }
      });
    });
  }"""
    strip_block(os.path.join(dist_dir, "popup.js"), DEV_TOOLS_JS)

    # 5. Strip mock data message listener from background.js
    DEV_TOOLS_BG = """  if (request.action === 'generateMockData') {
    if (!SHOW_DEV_TOOLS) {
      sendResponse({ success: false, error: 'Unauthorized in production' });
      return true;
    }
    populateMockIntelligenceData().then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }"""
    strip_block(os.path.join(dist_dir, "background.js"), DEV_TOOLS_BG)

    # 6. Zip the clean files
    print(f"Creating production package {os.path.basename(zip_filename)}...")
    with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(dist_dir):
            for file in files:
                file_path = os.path.join(root, file)
                # Compute archive name relative to the dist_dir
                arcname = os.path.relpath(file_path, dist_dir)
                zipf.write(file_path, arcname)

    # 7. Clean up the temp directory
    shutil.rmtree(dist_dir)
    print("Build complete! Clean package is ready for upload.")

if __name__ == "__main__":
    build()
