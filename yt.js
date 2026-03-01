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
    saved.forEach(id => addVideoToGrid(id, false));
    populateListDropdown();

    // Load saved theme
    const savedTheme = localStorage.getItem('yt_theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
    }
});

document.getElementById('addBtn').addEventListener('click', () => {
    const input = document.getElementById('videoUrl');
    let url = input.value.trim();
    
    if (!url) return;

    isGlobalPause = false; // Reset pause state so videos can play

    // Force HTTPS for generic URLs to avoid Mixed Content errors on Netlify
    if (url.startsWith('http://')) {
        url = url.replace('http://', 'https://');
    }

    const videoId = extractVideoId(url);
    
    if (videoId) {
        addVideoToGrid(videoId);
        input.value = ''; // Clear input
    } else if (url.includes('apnatube.in') || url.includes('atoplay.com') || url.includes('facebook.com') || url.includes('instagram.com')) {
        addVideoToGrid(url);
        input.value = '';
    } else {
        alert('Invalid URL. Please use YouTube, ApnaTube, Atoplay, Facebook or Instagram links.');
    }
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
    const currentVideos = Array.from(container.children).map(wrapper => wrapper.dataset.videoId).filter(id => id);
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
    lastDeletedVideos.forEach(id => addVideoToGrid(id, false));
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
        .map(div => div.dataset.videoId)
        .filter(id => id);

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
        videoIds.forEach(id => addVideoToGrid(id, false));
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
    const container = document.getElementById('videoContainer');
    Array.from(container.children).forEach((wrapper, index) => {
        setTimeout(() => {
            if (wrapper.player && typeof wrapper.player.playVideo === 'function') {
                wrapper.player.playVideo();
            }
        }, index * 10000); // 10 second delay between each start
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

function extractVideoId(url) {
    const listMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (listMatch) return listMatch[1];

    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([a-zA-Z0-9_-]{11}).*/;
    const match = url.match(regExp);
    return match ? match[2] : null;
}

function addVideoToGrid(id, save = true) {
    const container = document.getElementById('videoContainer');
    const wrapper = document.createElement('div');
    wrapper.className = 'video-wrapper';
    wrapper.dataset.videoId = id;

    // Check if it is a generic URL (ApnaTube) or a YouTube ID
    const isGenericUrl = id.includes('apnatube.in') || id.includes('atoplay.com') || id.includes('facebook.com') || id.includes('instagram.com');

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
        if (embedUrl.includes('atoplay.com') && embedUrl.includes('/videos/')) {
            embedUrl = embedUrl.replace('/videos/', '/embed/');
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
            playerVars: { 'autoplay': 0, 'mute': 0, 'loop': 1, 'playsinline': 1 },
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
            playerConfig.playerVars.playlist = id;
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
        .map(div => div.dataset.videoId)
        .filter(id => id);
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

// Keep-alive loop: Fixes issue where muted videos stop in background tabs
setInterval(() => {
    if (isGlobalPause) return; // Don't force play if user clicked "Pause All"

    const container = document.getElementById('videoContainer');
    Array.from(container.children).forEach(wrapper => {
        if (wrapper.player && typeof wrapper.player.getPlayerState === 'function') {
            // State 2 means PAUSED. If paused and not globally paused, force play.
            if (wrapper.player.getPlayerState() === 2) {
                wrapper.player.playVideo();
            }
        }
    });
}, 2000); // Check every 2 seconds

setInterval(() => {
    const container = document.getElementById('videoContainer');
    if (!container) return;

    const targetFrames = Array.from(container.querySelectorAll('iframe'));
    if (targetFrames.length === 0) return;

    const target = targetFrames[Math.floor(Math.random() * targetFrames.length)];
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const clickX = rect.left + (Math.random() * rect.width);
    const clickY = rect.top + (Math.random() * rect.height);

    target.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: clickX,
        clientY: clickY
    }));
}, 10000);
