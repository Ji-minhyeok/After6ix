document.getElementById("fetchWeather").addEventListener("click", async () => {
    const weatherResults = document.getElementById("weatherResults");
    weatherResults.innerHTML = "날씨 정보를 불러오는 중...";

    try {
        const currentTime = new Date();
        const baseDate = currentTime.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

        let baseTime = currentTime.getHours();
        let minutes = currentTime.getMinutes();

        if (minutes < 45) {
            baseTime = baseTime - 1;
            if (baseTime < 0) {
                baseTime = 23;
                currentTime.setDate(currentTime.getDate() - 1);
            }
        }

        const updatedBaseDate = currentTime.toISOString().slice(0, 10).replace(/-/g, '');
        baseTime = baseTime < 10 ? '0' + baseTime + '30' : baseTime + '30';

        // 위치 정보를 얻고 그 안에서 API 호출
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const latitude = pos.coords.latitude;
            const longitude = pos.coords.longitude;

            // 위경도 -> 격자 좌표 변환
            const gridCoords = convertToGrid(latitude, longitude);
            const grid_nx = gridCoords.nx;
            const grid_ny = gridCoords.ny;

            console.log(`격자 좌표: nx=${grid_nx}, ny=${grid_ny}`);

            const queryStringParameters = {
                base_date: updatedBaseDate,
                base_time: baseTime,
                nx: grid_nx,
                ny: grid_ny,
            };

            // Lambda 함수의 엔드포인트
            const lambdaEndpoint = "https://jpdo02170i.execute-api.ap-northeast-2.amazonaws.com/after6ix-stage";

            // Lambda 함수 호출
            const response = await fetch(
                `${lambdaEndpoint}?base_date=${queryStringParameters.base_date}&base_time=${queryStringParameters.base_time}&nx=${queryStringParameters.nx}&ny=${queryStringParameters.ny}`
            );

            if (!response.ok) {
                throw new Error("날씨 정보를 가져오는 데 실패했습니다.");
            }

            const weatherData = await response.json();
            console.log(weatherData); // 데이터 구조 확인
            displayWeatherData(weatherData);
        });
    } catch (error) {
        weatherResults.innerHTML = `<p class="error">${error.message}</p>`;
    }
});

function convertToGrid(lat, lon) {
    // LCC DFS 좌표변환을 위한 기초 자료
    const RE = 6371.00877; // 지구 반경(km)
    const GRID = 5.0; // 격자 간격(km)
    const SLAT1 = 30.0; // 투영 위도1(degree)
    const SLAT2 = 60.0; // 투영 위도2(degree)
    const OLON = 126.0; // 기준점 경도(degree)
    const OLAT = 38.0; // 기준점 위도(degree)
    const XO = 43; // 기준점 X좌표(GRID)
    const YO = 136; // 기준점 Y좌표(GRID)

    const DEGRAD = Math.PI / 180.0;
    const RADDEG = 180.0 / Math.PI;

    const re = RE / GRID;
    const slat1 = SLAT1 * DEGRAD;
    const slat2 = SLAT2 * DEGRAD;
    const olon = OLON * DEGRAD;
    const olat = OLAT * DEGRAD;

    let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
    sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
    let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
    sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
    let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
    ro = (re * sf) / Math.pow(ro, sn);

    let ra = Math.tan(Math.PI * 0.25 + (lat) * DEGRAD * 0.5);
    ra = (re * sf) / Math.pow(ra, sn);
    let theta = lon * DEGRAD - olon;
    if (theta > Math.PI) theta -= 2.0 * Math.PI;
    if (theta < -Math.PI) theta += 2.0 * Math.PI;
    theta *= sn;

    const x = Math.floor(ra * Math.sin(theta) + XO + 0.5);
    const y = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);

    return { nx: x, ny: y };
}

// 날씨 데이터를 화면에 표시하는 함수
function displayWeatherData(weatherData) {
    const weatherResults = document.getElementById("weatherResults");

    // 응답 구조 확인 후 'items'가 존재하는지 체크
    if (!weatherData.response || !weatherData.response.body || !weatherData.response.body.items) {
        weatherResults.innerHTML = `<p class="error">날씨 정보가 없습니다.</p>`;
        return;
    }

    const items = weatherData.response.body.items.item;
    const filteredData = items.filter(item => ['T1H', 'RN1', 'SKY', 'REH', 'PTY'].includes(item.category));

    // 시간대별로 데이터를 재조합
    const groupedData = groupWeatherData(filteredData);

    // 시간별로 오름차순 정렬
    const sortedTimes = Object.keys(groupedData).sort((a, b) => parseInt(a) - parseInt(b));

    // 데이터를 출력
    weatherResults.innerHTML = "";
    sortedTimes.forEach(time => {
        const weatherItem = groupedData[time];
        const weatherDiv = document.createElement("div");
        weatherDiv.classList.add("weather-item");

        // 하늘 상태와 강수 형태를 결합하여 현재 날씨 표시
        const currentWeather = getCurrentWeather(weatherItem);

        // 강수량 표시, "강수없음"은 0으로 치환하고 mm 제거
        const rainfall = weatherItem.RN1 === "강수없음" ? "0mm" : `${weatherItem.RN1}mm`;

        // 시각을 '11시'와 같이 간단하게 표현
        const formattedTime = formatTime(time);

        weatherDiv.innerHTML = `
            <h3>${formattedTime}</h3>
            <p>기온: ${weatherItem.T1H || 'N/A'}°C</p>
            <p>습도: ${weatherItem.REH || 'N/A'}%</p>
            <p>강수량: ${rainfall}</p>
            <p>현재 날씨: ${currentWeather}</p>
        `;

        weatherResults.appendChild(weatherDiv);
    });
}

// 시간대별 데이터 재조합 함수
function groupWeatherData(items) {
    const grouped = {};

    items.forEach(item => {
        const time = item.fcstTime;
        if (!grouped[time]) {
            grouped[time] = {};
        }
        grouped[time][item.category] = item.fcstValue;
    });

    return grouped;
}

// 현재 날씨 이모지 처리
function getCurrentWeather(weatherItem) {
    let sky = weatherItem.SKY;
    let pty = weatherItem.PTY;

    let weatherIcon = "☀️"; // 기본 하늘 상태: 맑음 (구름 없는 해)

    // 하늘 상태 및 강수 형태를 결합
    if (sky === "1" && pty === "1") {
        weatherIcon = "🌧️"; // 비
    } else if (sky === "1" && pty === "2") {
        weatherIcon = "❄️🌧️"; // 눈/비
    } else if (sky === "1" && pty === "3") {
        weatherIcon = "❄️"; // 눈
    } else if (sky === "3") {
        weatherIcon = "☁️"; // 구름 많음
    } else if (sky === "4") {
        weatherIcon = "🌫️"; // 흐림
    }

    return weatherIcon;
}


// 시각을 4자리 숫자에서 2자리로 변환하는 함수
function formatTime(time) {
    const hour = parseInt(time.slice(0, 2), 10);  // 4자리 문자열에서 시(hour)만 추출하여 숫자로 변환
    return `${hour}시`; // 9시, 10시 형태로 반환
}
