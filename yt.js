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

let isMuted = true;
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
    volumeSlider.value = 50;
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
                    if (isPlaylist) {
                        event.target.setShuffle(true);
                    }
                    if (typeof event.target.getVolume === 'function') {
                        volumeSlider.value = event.target.getVolume();
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