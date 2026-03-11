// --- Pop-up Ad Control Logic ---
// यह कोड विज्ञापन स्क्रिप्ट द्वारा खोले गए नए टैब को प्रबंधित करने का प्रयास करता है।
// यह ब्राउज़र के डिफ़ॉल्ट `window.open` फ़ंक्शन को ओवरराइड करता है।

const originalWindowOpen = window.open; // मूल फ़ंक्शन को सहेजें

window.open = function(...args) {
    const newWindow = originalWindowOpen.apply(this, args); // अनुरोध के अनुसार नया टैब खोलें

    // यदि कोई नया टैब/विंडो खुलता है, तो हम मानते हैं कि यह एक विज्ञापन है।
    if (newWindow) {
        window.focus(); // उपयोगकर्ता को तुरंत मुख्य पृष्ठ पर वापस लाएं।
        // 10 से 20 सेकंड के बीच एक रैंडम समय के बाद, हम उस नए टैब को बंद करने का प्रयास करते हैं।
        const randomDelay = Math.floor(Math.random() * 10001) + 10000; // 10000ms to 20000ms
        setTimeout(() => { newWindow.close(); }, randomDelay);
    }

    return newWindow;
};

// Load YouTube IFrame Player API
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

let isGlobalPause = false; // Track if user intentionally paused everything

// Load saved videos on startup
document.addEventListener('DOMContentLoaded', () => {
    const saved = JSON.parse(localStorage.getItem('yt_videos') || '[]');
    saved.forEach(videoData => {
        // Handle both old format (string ID) and new format (object)
        if (typeof videoData === 'string') {
            // For backward compatibility, treat old data as non-shorts
            addVideoToGrid({ id: videoData, isShort: false }, false);
        } else {
            addVideoToGrid(videoData, false);
        }
    });
    populateListDropdown();

    // Load saved theme
    const savedTheme = localStorage.getItem('yt_theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
    }
});

document.getElementById('addBtn').addEventListener('click', () => {
    const urlInput = document.getElementById('videoUrl');
    const countInput = document.getElementById('gridCount');
    let url = urlInput.value.trim();
    const count = parseInt(countInput.value, 10) || 1;
    
    if (!url) return;

    isGlobalPause = false; // Reset pause state so videos can play

    for (let i = 0; i < count; i++) {
        let currentUrl = url;
        // Force HTTPS for generic URLs to avoid Mixed Content errors on Netlify
        if (currentUrl.startsWith('http://')) {
            currentUrl = currentUrl.replace('http://', 'https://');
        }

        const videoInfo = extractVideoInfo(currentUrl);
        
        if (videoInfo) {
            addVideoToGrid(videoInfo);
        } else if (currentUrl.includes('apnatube.in') || currentUrl.includes('atoplay.com') || currentUrl.includes('facebook.com') || currentUrl.includes('instagram.com')) {
            addVideoToGrid(currentUrl);
        } else if (i === 0) { // Show alert only once
            alert('Invalid URL. Please use YouTube, ApnaTube, Atoplay, Facebook or Instagram links.');
        }
    }

    urlInput.value = ''; // Clear input after adding
});

document.getElementById('videoUrl').addEventListener('keyup', (event) => {
    if (event.key === 'Enter') {
        document.getElementById('addBtn').click();
    }
});

let lastDeletedVideos = [];

document.getElementById('clearBtn').addEventListener('click', () => {
    const container = document.getElementById('videoContainer');
    
    // Save videos before clearing
    const currentVideos = Array.from(container.children).map(wrapper => {
        return {
            id: wrapper.dataset.videoId,
            isShort: wrapper.classList.contains('short-video-wrapper')
        };
    }).filter(data => data.id);

    if (currentVideos.length > 0) {
        lastDeletedVideos = currentVideos;
        document.getElementById('undoBtn').style.display = 'inline-block';
    }

    Array.from(container.children).forEach(wrapper => {
        if (wrapper.cleanup) wrapper.cleanup();
    });
    container.innerHTML = '';
    updateCounter();
    saveVideos();
});

document.getElementById('undoBtn').addEventListener('click', () => {
    lastDeletedVideos.forEach(videoData => addVideoToGrid(videoData, false));
    saveVideos();
    document.getElementById('undoBtn').style.display = 'none';
    lastDeletedVideos = [];
});

document.getElementById('shuffleBtn').addEventListener('click', () => {
    isGlobalPause = false;
    const container = document.getElementById('videoContainer');
    const videos = Array.from(container.children);
    
    for (let i = videos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [videos[i], videos[j]] = [videos[j], videos[i]];
    }
    
    videos.forEach(video => container.appendChild(video));
    saveVideos();
});

document.getElementById('saveListBtn').addEventListener('click', () => {
    const currentVideos = Array.from(document.querySelectorAll('.video-wrapper'))
        .map(div => ({
            id: div.dataset.videoId,
            isShort: div.classList.contains('short-video-wrapper')
        }))
        .filter(data => data.id);

    if (currentVideos.length === 0) {
        alert("There are no videos to save in a list.");
        return;
    }

    const listName = prompt("Enter a name for the current list of videos:");
    if (listName && listName.trim()) {
        const lists = getSavedLists();
        lists[listName.trim()] = currentVideos;
        saveLists(lists);
        populateListDropdown();
        alert(`List '${listName.trim()}' saved!`);
    }
});

document.getElementById('loadListSelect').addEventListener('change', (e) => {
    const listName = e.target.value;
    if (!listName) return;

    const lists = getSavedLists();
    const videoIds = lists[listName];

    if (videoIds) {
        // Clear grid without saving to undo buffer
        const container = document.getElementById('videoContainer');
        Array.from(container.children).forEach(wrapper => {
            if (wrapper.cleanup) wrapper.cleanup();
        });
        container.innerHTML = '';
        updateCounter();
        
        // Load new videos
        videoIds.forEach(videoData => addVideoToGrid(videoData, false));
        saveVideos(); // Now save the new state as the last session
    }
});

document.getElementById('deleteListBtn').addEventListener('click', () => {
    const select = document.getElementById('loadListSelect');
    const listName = select.value;

    if (!listName) {
        alert("Please select a list to delete from the dropdown.");
        return;
    }

    if (confirm(`Are you sure you want to delete the list '${listName}'?`)) {
        const lists = getSavedLists();
        delete lists[listName];
        saveLists(lists);
        populateListDropdown();
    }
});

let isMuted = false;
document.getElementById('muteAllBtn').addEventListener('click', () => {
    isMuted = !isMuted;
    document.getElementById('muteAllBtn').innerText = isMuted ? 'Unmute All' : 'Mute All';
    
    const container = document.getElementById('videoContainer');
    Array.from(container.children).forEach(wrapper => {
        if (wrapper.player && typeof wrapper.player.mute === 'function') {
            isMuted ? wrapper.player.mute() : wrapper.player.unMute();
        }
    });
});

document.getElementById('playAllBtn').addEventListener('click', () => {
    isGlobalPause = false; // Enable auto-resume
    
    // Get delay from user input (default to 10 seconds if empty)
    const delayInput = document.getElementById('playDelay');
    const delay = (parseInt(delayInput.value) || 10) * 1000;

    const container = document.getElementById('videoContainer');
    Array.from(container.children).forEach((wrapper, index) => {
        setTimeout(() => {
            if (wrapper.player && typeof wrapper.player.playVideo === 'function') {
                wrapper.player.playVideo();
            }
        }, index * delay); // User defined delay
    });
});

document.getElementById('pauseAllBtn').addEventListener('click', () => {
    isGlobalPause = true; // Disable auto-resume because user wants to pause
    const container = document.getElementById('videoContainer');
    Array.from(container.children).forEach(wrapper => {
        if (wrapper.player && typeof wrapper.player.pauseVideo === 'function') {
            wrapper.player.pauseVideo();
        }
    });
});

document.getElementById('themeBtn').addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    const theme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
    localStorage.setItem('yt_theme', theme);
});

let currentQuality = 'tiny'; // Default to 144p

document.getElementById('qualitySelect').addEventListener('change', (e) => {
    currentQuality = e.target.value;
    const container = document.getElementById('videoContainer');
    Array.from(container.children).forEach(wrapper => {
        if (wrapper.player && typeof wrapper.player.setPlaybackQuality === 'function') {
            wrapper.player.setPlaybackQuality(currentQuality);
        }
    });
});

document.getElementById('aspectRatioSelect').addEventListener('change', (e) => {
    const container = document.getElementById('videoContainer');
    container.classList.remove('ratio-16-9', 'ratio-9-16', 'ratio-1-1');
    if (e.target.value !== 'auto') {
        container.classList.add(e.target.value);
    }
});

function extractVideoInfo(url) {
    const listMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (listMatch) return { id: listMatch[1], isShort: false };

    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([a-zA-Z0-9_-]{11}).*/;
    const match = url.match(regExp);
    if (match) {
        const isShort = url.includes('/shorts/');
        return { id: match[2], isShort: isShort };
    }
    return null;
}

function addVideoToGrid(videoData, save = true) {
    let id, isShort;

    // Handle different formats for videoData (string for generic URLs, object for YouTube)
    if (typeof videoData === 'string') {
        id = videoData;
        isShort = false;
    } else if (typeof videoData === 'object' && videoData.id) {
        id = videoData.id;
        isShort = videoData.isShort || false;
    } else {
        return; // Exit if data is not in a recognized format
    }

    const container = document.getElementById('videoContainer');
    const wrapper = document.createElement('div');
    wrapper.className = 'video-wrapper';
    wrapper.dataset.videoId = id;

    // Check if it is a generic URL (ApnaTube) or a YouTube ID
    const isGenericUrl = id.includes('apnatube.in') || id.includes('atoplay.com') || id.includes('facebook.com') || id.includes('instagram.com');

    if (isShort) {
        wrapper.classList.add('short-video-wrapper');
    }

    // Cleanup function to stop timers
    wrapper.cleanup = () => {
        if (wrapper.timer) clearTimeout(wrapper.timer);
        if (wrapper.interval) clearInterval(wrapper.interval);
        if (wrapper.player && typeof wrapper.player.destroy === 'function') {
            wrapper.player.destroy();
        }
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerText = 'X';
    deleteBtn.onclick = () => {
        wrapper.cleanup();
        wrapper.remove();
        updateCounter();
        saveVideos();
    };

    // Volume Slider
    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'slider-container';
    
    const volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.min = 0;
    volumeSlider.max = 100;
    volumeSlider.value = 5;
    volumeSlider.className = 'volume-slider';
    volumeSlider.title = 'Volume Control';
    
    volumeSlider.addEventListener('input', (e) => {
        const vol = parseInt(e.target.value);
        if (wrapper.player && typeof wrapper.player.setVolume === 'function') {
            wrapper.player.setVolume(vol);
            if (vol > 0 && wrapper.player.isMuted && wrapper.player.isMuted()) wrapper.player.unMute();
        }
    });
    sliderContainer.addEventListener('click', (e) => e.stopPropagation());
    sliderContainer.appendChild(volumeSlider);

    const playerId = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const playerDiv = document.createElement('div');
    playerDiv.id = playerId;
    
    const spinner = document.createElement('div');
    spinner.className = 'spinner-overlay';
    spinner.innerHTML = '<div class="spinner"></div>';

    wrapper.appendChild(deleteBtn);
    wrapper.appendChild(playerDiv);
    wrapper.appendChild(spinner);
    wrapper.appendChild(sliderContainer);
    container.appendChild(wrapper);
    updateCounter();
    if (save) saveVideos();

    if (isGenericUrl) {
        let embedUrl = id;
        // Ensure HTTPS for display to prevent blocking
        if (embedUrl.startsWith('http://')) {
            embedUrl = embedUrl.replace('http://', 'https://');
        }

        // Convert Atoplay video URLs to embed URLs to fix "refused to connect"
        if (embedUrl.includes('atoplay.com')) {
            const match = embedUrl.match(/atoplay\.com\/videos\/([a-zA-Z0-9_-]+)/);
            if (match && match[1]) embedUrl = `https://atoplay.com/embed/${match[1]}`;
        }

        // Handle ApnaTube or other generic iframes
        const iframe = document.createElement('iframe');
        iframe.src = embedUrl;
        iframe.allow = "autoplay; fullscreen";
        playerDiv.replaceWith(iframe);
        spinner.style.display = 'none'; // Hide spinner as we can't track buffering
        sliderContainer.style.display = 'none'; // Hide slider for generic URLs
        return; // Skip YouTube Player initialization
    }

    // YouTube Player Initialization
    const initPlayer = () => {
        const isPlaylist = id.length > 11;
        const playerConfig = {
            height: '100%',
            width: '100%',
            playerVars: { 'autoplay': 0, 'mute': 0, 'playsinline': 1, 'origin': window.location.origin },
            events: {
                'onReady': (event) => {
                    if (isPlaylist) event.target.setShuffle(true);
                    event.target.setVolume(volumeSlider.value); // Set player volume from slider

                    if (isMuted) {
                        event.target.mute();
                    }
                },
                'onStateChange': (event) => {
                    if (event.data === YT.PlayerState.PLAYING) {
                        spinner.style.display = 'none';
                    } else if (event.data === YT.PlayerState.BUFFERING) {
                        spinner.style.display = 'flex';
                    }

                    if (event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.BUFFERING) {
                        event.target.setPlaybackQuality(currentQuality);
                    }
                    if (event.data === YT.PlayerState.ENDED) {
                        if (!isPlaylist) {
                            event.target.playVideo();
                        }
                    }
                }
            }
        };

        if (isPlaylist) {
            playerConfig.playerVars.listType = 'playlist';
            playerConfig.playerVars.list = id;
        } else {
            playerConfig.videoId = id;
        }

        wrapper.player = new YT.Player(playerId, playerConfig);
    };

    if (window.YT && window.YT.Player) {
        initPlayer();
    } else {
        const checkYT = setInterval(() => {
            if (window.YT && window.YT.Player) {
                clearInterval(checkYT);
                initPlayer();
            }
        }, 100);
    }
}

function getSavedLists() {
    return JSON.parse(localStorage.getItem('yt_video_lists') || '{}');
}

function saveLists(lists) {
    localStorage.setItem('yt_video_lists', JSON.stringify(lists));
}

function populateListDropdown() {
    const select = document.getElementById('loadListSelect');
    const lists = getSavedLists();
    const currentSelection = select.value;

    // Clear existing options except the first one
    select.innerHTML = '<option value="">Load List</option>';

    for (const name in lists) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    }

    // Restore selection if it still exists
    if (lists[currentSelection]) {
        select.value = currentSelection;
    }
}

function saveVideos() {
    const videos = Array.from(document.querySelectorAll('.video-wrapper'))
        .map(div => ({
            id: div.dataset.videoId,
            isShort: div.classList.contains('short-video-wrapper')
        }))
        .filter(data => data.id);
    localStorage.setItem('yt_videos', JSON.stringify(videos));
}

function updateCounter() {
    const count = document.getElementById('videoContainer').children.length;
    document.getElementById('videoCounter').innerText = `Playing: ${count}`;
}

// Back to Top Button Logic
const backToTopBtn = document.getElementById("backToTopBtn");

window.onscroll = () => {
    if (document.body.scrollTop > 200 || document.documentElement.scrollTop > 200) {
        backToTopBtn.style.display = "block";
    } else {
        backToTopBtn.style.display = "none";
    }
};

backToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});
