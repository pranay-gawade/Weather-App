
        const app = (() => {
            const state = {
                cities: [],
                view: 'grid',
                theme: 'light',
                settings: { name: 'User', avatar: '', apiKey: '' }
            };
            
            // Runtime variable for Chart instance
            let chartInstance = null;

            const els = {
                input: document.getElementById('cityInput'),
                container: document.getElementById('cityContainer'),
                loader: document.getElementById('searchLoader'),
                detail: document.getElementById('detail-view'),
                greeting: document.getElementById('greeting'),
                modal: document.getElementById('keyModal'),
                modalInput: document.getElementById('modalInput'),
                themeIcon: document.getElementById('themeIcon'),
                themeText: document.getElementById('themeText'),
                toast: document.getElementById('errorToast'),
                toastMsg: document.getElementById('errorMsg')
            };

            function init() {
                const saved = localStorage.getItem('atmos_state');
                if (saved) Object.assign(state, JSON.parse(saved));
                
                applyTheme();
                renderCities();
                updateProfile();
                
                if (!state.settings.apiKey) els.modal.classList.add('open');
                updateApiStatus();
            }

            function save() {
                localStorage.setItem('atmos_state', JSON.stringify(state));
            }

            function toggleTheme() {
                state.theme = state.theme === 'light' ? 'dark' : 'light';
                applyTheme();
                save();
            }

            function applyTheme() {
                document.documentElement.setAttribute('data-theme', state.theme);
                els.themeIcon.innerText = state.theme === 'light' ? 'dark_mode' : 'light_mode';
                els.themeText.innerText = state.theme === 'light' ? 'Dark Mode' : 'Light Mode';
            }

            function updateApiStatus() {
                const badge = document.getElementById('apiStatusBadge');
                badge.innerText = state.settings.apiKey ? 'API: Connected' : 'API: Demo Mode';
                badge.style.background = state.settings.apiKey ? 'var(--primary-container)' : '#e5e7eb';
                badge.style.color = state.settings.apiKey ? 'var(--on-primary-container)' : '#374151';
            }

            function showToast(msg) {
                els.toastMsg.innerText = msg;
                els.toast.classList.add('show');
                setTimeout(() => els.toast.classList.remove('show'), 4000);
            }

            function saveKeyFromModal() {
                const key = els.modalInput.value.trim();
                if(key) {
                    state.settings.apiKey = key;
                    save();
                    els.modal.classList.remove('open');
                    updateApiStatus();
                }
            }

            function useDemoMode() {
                els.modal.classList.remove('open');
                state.settings.apiKey = ''; // Ensure key is cleared for demo
                save();
                updateApiStatus();
            }

            function clearKey() {
                state.settings.apiKey = '';
                save();
                updateProfile();
                updateApiStatus();
                showToast('API Key removed. Using Demo Mode.');
            }

            function getLocation() {
                if(!navigator.geolocation) return showToast('Geolocation not supported');
                els.loader.style.display = 'block';
                navigator.geolocation.getCurrentPosition(async pos => {
                    try {
                        const { latitude, longitude } = pos.coords;
                        
                        // Handle Demo Mode for Location
                        if (!state.settings.apiKey) {
                            await new Promise(r => setTimeout(r, 600));
                            addCity(mockData("My Location"));
                            return;
                        }

                        // 1. Fetch Current Weather
                        const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${state.settings.apiKey}`);
                        if (weatherRes.status === 401) throw new Error('401_AUTH');
                        if (!weatherRes.ok) throw new Error("Location fetch failed");
                        const weatherData = await weatherRes.json();

                        // 2. Fetch Forecast
                        const forecastRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&units=metric&appid=${state.settings.apiKey}`);
                        if (!forecastRes.ok) throw new Error("Forecast fetch failed");
                        const forecastData = await forecastRes.json();

                        // Merge Data
                        weatherData.forecast = forecastData.list.slice(0, 9); // Keep next 24 hours (8-9 items)
                        addCity(weatherData);

                    } catch(e) {
                        handleError(e);
                    } finally {
                        els.loader.style.display = 'none';
                    }
                }, () => {
                    els.loader.style.display = 'none';
                    showToast('Location permission denied');
                });
            }

            async function searchCity() {
                const term = els.input.value.trim();
                if (!term) return;
                els.loader.style.display = 'block';
                
                try {
                    let data;
                    if (state.settings.apiKey) {
                        // 1. Fetch Current Weather
                        const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${term}&units=metric&appid=${state.settings.apiKey}`);
                        
                        if (weatherRes.status === 401) throw new Error('401_AUTH');
                        if (weatherRes.status === 404) throw new Error('City not found');
                        if (!weatherRes.ok) throw new Error('Network error');
                        
                        const weatherData = await weatherRes.json();
                        
                        // 2. Fetch Forecast (using coords from first call for accuracy)
                        const { lat, lon } = weatherData.coord;
                        const forecastRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${state.settings.apiKey}`);
                        if (!forecastRes.ok) throw new Error('Forecast error');
                        const forecastData = await forecastRes.json();

                        // Merge
                        weatherData.forecast = forecastData.list.slice(0, 9); // Keep next ~24h (3h intervals)
                        data = weatherData;

                    } else {
                        await new Promise(r => setTimeout(r, 600));
                        data = mockData(term);
                    }
                    addCity(data);
                    els.input.value = '';
                } catch (err) {
                    handleError(err);
                } finally {
                    els.loader.style.display = 'none';
                }
            }

            function handleError(err) {
                if (err.message === '401_AUTH') {
                    showToast('Invalid API Key. Reverting to Demo Mode.');
                    state.settings.apiKey = ''; 
                    save();
                    updateApiStatus();
                    els.modal.classList.add('open');
                } else {
                    showToast(err.message);
                }
            }

            function mockData(name) {
                const t = Math.floor(Math.random()*30);
                
                // Generate Mock Forecast (8 items for 24 hours)
                const forecast = [];
                for(let i=0; i<9; i++) {
                    forecast.push({
                        dt: (Date.now()/1000) + (i * 3600 * 3), // +3 hours each
                        main: { temp: t + Math.sin(i)*3 + (Math.random()*2 - 1) }
                    });
                }

                return {
                    name: name.charAt(0).toUpperCase() + name.slice(1),
                    main: { temp: t, humidity: Math.floor(Math.random()*80)+10 },
                    weather: [{ main: ['Clear','Rain','Clouds'][Math.floor(Math.random()*3)], description: 'simulated weather' }],
                    wind: { speed: Math.floor(Math.random()*15) },
                    dt: Date.now()/1000,
                    sys: { country: 'DM' },
                    mock: true,
                    forecast: forecast
                };
            }

            function addCity(data) {
                state.cities = state.cities.filter(c => c.name.toLowerCase() !== data.name.toLowerCase());
                state.cities.unshift(data);
                if(state.cities.length > 8) state.cities.pop();
                save();
                renderCities();
            }

            function renderCities() {
                els.container.innerHTML = '';
                document.getElementById('emptyState').style.display = state.cities.length ? 'none' : 'block';
                
                state.cities.forEach(c => {
                    const el = document.createElement('div');
                    el.className = 'card';
                    const icon = `https://openweathermap.org/img/wn/${getIcon(c.weather[0].main)}@2x.png`;
                    
                    if(state.view === 'list') {
                        el.innerHTML = `
                        <div class="card-content">
                            <img src="${icon}" style="width:60px;height:60px;">
                            <div>
                                <div class="city-name" style="font-size:1.2rem;">${c.name}</div>
                                <div class="weather-desc">${c.weather[0].description}</div>
                            </div>
                            <div class="temp-display" style="font-size:2rem;">${Math.round(c.main.temp)}°</div>
                        </div>`;
                    } else {
                        el.innerHTML = `
                        <div class="card-header">
                            <div>
                                <div class="city-name">${c.name}</div>
                                <div class="weather-desc">${c.weather[0].description}</div>
                            </div>
                            <img src="${icon}" class="weather-icon-img">
                        </div>
                        <div class="temp-display">${Math.round(c.main.temp)}°</div>`;
                    }
                    el.onclick = () => showDetail(c);
                    els.container.appendChild(el);
                });
            }

            function getIcon(m) {
                const map = { 'Clear':'01d','Clouds':'03d','Rain':'10d','Snow':'13d','Thunderstorm':'11d','Drizzle':'09d' };
                return map[m] || '50d';
            }

            function setView(v) {
                state.view = v;
                els.container.className = v === 'list' ? 'city-grid list-view' : 'city-grid';
                document.getElementById('btnGrid').className = v === 'grid' ? 'icon-btn active' : 'icon-btn';
                document.getElementById('btnList').className = v === 'list' ? 'icon-btn active' : 'icon-btn';
                save();
                renderCities();
            }

            function clearHistory() {
                if(confirm('Delete all saved locations?')) {
                    state.cities = [];
                    save();
                    renderCities();
                }
            }

            function showDetail(c) {
                document.getElementById('detailCityName').innerText = c.name;
                document.getElementById('detailTemp').innerText = Math.round(c.main.temp) + '°';
                document.getElementById('detailDesc').innerText = c.weather[0].description;
                document.getElementById('detailHumidity').innerText = c.main.humidity + '%';
                document.getElementById('detailWind').innerText = c.wind.speed + ' km/h';
                document.getElementById('weatherIconLarge').src = `https://openweathermap.org/img/wn/${getIcon(c.weather[0].main)}@4x.png`;
                
                els.detail.classList.add('active');
                fetchWiki(c.name);
                
                // Use stored forecast if available, else fallback
                if(c.forecast) {
                    drawChart(c.forecast);
                } else {
                    // Fallback for old data without forecast
                    drawChartMock(c.main.temp);
                }
            }

            async function fetchWiki(name) {
                const txt = document.getElementById('cityWikiExtract');
                txt.innerText = 'Loading info...';
                try {
                    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${name}`);
                    const d = await r.json();
                    if(d.type === 'standard') {
                        txt.innerText = d.extract;
                        document.getElementById('wikiLink').href = d.content_urls.desktop.page;
                    } else throw new Error();
                } catch {
                    txt.innerText = 'No specific insights available for this location.';
                }
            }

            function drawChart(forecastData) {
                const ctx = document.getElementById('tempChart').getContext('2d');
                if(chartInstance) chartInstance.destroy();

                const labels = forecastData.map(item => {
                    const date = new Date(item.dt * 1000);
                    return date.getHours() + ':00';
                });
                
                const data = forecastData.map(item => item.main.temp);
                
                const color = getComputedStyle(document.body).getPropertyValue('--primary').trim();
                
                chartInstance = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            data: data,
                            borderColor: color,
                            backgroundColor: color + '33', // 20% opacity hex
                            borderWidth: 3,
                            fill: true,
                            tension: 0.4,
                            pointRadius: 4,
                            pointBackgroundColor: 'white',
                            pointBorderColor: color
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { 
                            x: { grid: { display: false } }, 
                            y: { display: true, grid: { color: 'rgba(0,0,0,0.05)' } } 
                        }
                    }
                });
            }
            
            function drawChartMock(base) {

                const mockForecast = [];
                for(let i=0; i<6; i++) {
                     mockForecast.push({ dt: (Date.now()/1000)+i*3600, main: { temp: base + Math.sin(i) } });
                }
                drawChart(mockForecast);
            }

            function closeDetail() { els.detail.classList.remove('active'); }

            function switchTab(t) {
                document.getElementById('dashboardTab').style.display = t === 'dashboard' ? 'block' : 'none';
                document.getElementById('settingsTab').style.display = t === 'settings' ? 'block' : 'none';
                document.querySelectorAll('.nav-btn').forEach((b,i) => b.classList.toggle('active', (i===0 && t==='dashboard') || (i===1 && t==='settings')));
            }

            function saveSettings() {
                state.settings.name = document.getElementById('settingName').value;
                state.settings.avatar = document.getElementById('settingImg').value;
                state.settings.apiKey = document.getElementById('settingKey').value;
                save();
                updateProfile();
                updateApiStatus();
                showToast('Settings Saved');
            }

            function updateProfile() {
                document.getElementById('settingName').value = state.settings.name;
                document.getElementById('settingImg').value = state.settings.avatar;
                document.getElementById('settingKey').value = state.settings.apiKey;
                document.getElementById('sidebarName').innerText = state.settings.name;
                
                const av = document.getElementById('sidebarAvatar');
                if(state.settings.avatar) av.innerHTML = `<img src="${state.settings.avatar}">`;
                else av.innerText = state.settings.name.charAt(0).toUpperCase();
                
                const h = new Date().getHours();
                els.greeting.innerText = `${h<12?'Good Morning':h<18?'Good Afternoon':'Good Evening'}, ${state.settings.name}`;
            }

            return { init, searchCity, switchTab, saveSettings, closeDetail, setView, clearHistory, toggleTheme, saveKeyFromModal, useDemoMode, getLocation, clearKey };
        })();

        window.onload = app.init;
