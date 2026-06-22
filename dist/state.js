import { Stone } from "./stone.js";
export const canvas = document.getElementById('gameCanvas');
export const ctx = canvas.getContext('2d');
/**
 * Опциональное правило: "Чередование битков".
 * В рамках серии ударов (пока ход сохраняется благодаря чистому проходу)
 * нельзя бить одним и тем же камнем дважды подряд.
 * При переходе хода к сопернику ограничение сбрасывается.
 */
export let alternateStriker = false;
// ============================================================
// ФИЗИЧЕСКИЕ КОНСТАНТЫ (едины для всей игры и AI)
// ============================================================
/** Множитель силы удара от длины вектора натяжения мыши */
export const FORCE_FACTOR = 0.12;
/** Максимальная сила удара (пиковая скорость камня после удара) */
export const MAX_FORCE = 18;
/**
 * Коэффициент трения о поверхность стола.
 * Применяется каждый кадр: скорость умножается на это значение.
 */
export const FRICTION = 0.98;
/**
 * Порог остановки камня (доля от радиуса).
 * Если скорость камня ниже этого значения, он считается остановившимся.
 */
export const STOP_THRESHOLD_RATIO = 0.05;
/** Коэффициент упругости при столкновении камней */
export const BOUNCE_COEFFICIENT = 0.7;
// ============================================================
// КОНСТАНТЫ ИГРОВОГО ПОЛЯ
// ============================================================
/** Верхняя координата ворот по оси Y */
export const GOAL_Y = 280;
/** Высота ворот */
export const GOAL_HEIGHT = 240;
/** Ширина створа ворот */
export const GOAL_WIDTH = 30;
/** Радиус камня (в пикселях) */
export const STONE_RADIUS = 28;
// ============================================================
// НАСТРОЙКИ ИГРОКА (регулируются слайдерами)
// ============================================================
/**
 * Стандартное отклонение Гауссова разброса удара.
 * Регулируется слайдером "Разброс удара" (0.1..0.5).
 */
export let spreadFactor = 0.35;
/**
 * Время визуализации "мыслей" бота перед ударом (в кадрах).
 * Регулируется логарифмическим слайдером (1..600).
 */
export let aiThinkingTime = 120;
/**
 * Опциональное правило: нельзя одним камнем ходить два раза подряд.
 * Управляется чекбоксом в интерфейсе.
 */
export let noRepeatStriker = false;
/**
 * Инициализирует слайдер разброса удара.
 */
export function initSpreadSlider() {
    const slider = document.getElementById('spreadSlider');
    const valueDisplay = document.getElementById('spreadValue');
    if (!slider || !valueDisplay) {
        console.warn('Слайдер разброса не найден в DOM.');
        return;
    }
    // ВАЖНО: устанавливаем значение из переменной (которая могла быть загружена из cookie)
    slider.value = spreadFactor.toString();
    valueDisplay.textContent = spreadFactor.toFixed(2);
    slider.addEventListener('input', () => {
        spreadFactor = parseFloat(slider.value);
        valueDisplay.textContent = spreadFactor.toFixed(2);
        saveSettingsToCookie(); // Сохраняем
    });
}
/**
 * Инициализирует логарифмический слайдер времени "раздумий" бота.
 */
export function initAIThinkingSlider() {
    const slider = document.getElementById('aiThinkingSlider');
    const valueDisplay = document.getElementById('aiThinkingValue');
    if (!slider || !valueDisplay) {
        console.warn('Слайдер времени ИИ не найден в DOM.');
        return;
    }
    const logMax = Math.log10(600);
    const updateValue = () => {
        const sliderVal = parseFloat(slider.value);
        aiThinkingTime = Math.round(Math.pow(10, (sliderVal / 100) * logMax));
        valueDisplay.textContent = `${aiThinkingTime} кадр. (${(aiThinkingTime / 60).toFixed(1)} сек.)`;
    };
    // Устанавливаем начальное значение из переменной
    const initialSliderVal = (Math.log10(aiThinkingTime) / logMax) * 100;
    slider.value = initialSliderVal.toString();
    updateValue();
    slider.addEventListener('input', () => {
        updateValue();
        saveSettingsToCookie(); // Сохраняем
    });
}
/**
 * Инициализирует чекбокс правила "не повторять биток".
 */
export function initNoRepeatCheckbox() {
    const checkbox = document.getElementById('noRepeatCheckbox');
    if (!checkbox) {
        console.warn('Чекбокс правила не найден в DOM.');
        return;
    }
    checkbox.checked = noRepeatStriker;
    checkbox.addEventListener('change', () => {
        noRepeatStriker = checkbox.checked;
        if (!noRepeatStriker) {
            GameState.lastUsedStriker = null;
        }
    });
}
// ============================================================
// ИГРОВЫЕ ОБЪЕКТЫ
// ============================================================
/** Массив из трех игровых камней */
export const stones = [
    new Stone(0, 0, STONE_RADIUS, '#999999'),
    new Stone(0, 0, STONE_RADIUS, '#bbbbbb'),
    new Stone(0, 0, STONE_RADIUS, '#777777')
];
/**
 * Глобальное состояние игры.
 */
export const GameState = {
    /** Камень, который сейчас тянет игрок (рогатка) */
    selectedStone: null,
    /** Флаг: находится ли игрок в режиме прицеливания */
    isAiming: false,
    /** Текущая позиция мыши по X */
    mouseX: 0,
    /** Текущая позиция мыши по Y */
    mouseY: 0,
    /** Камень, который был ударен последним (активный камень) */
    lastStruckStone: null,
    /** Флаг: совершил ли активный камень "чистый проход" */
    hasPassedThrough: false,
    /** Флаг: задел ли активный камень другой камень (фол) */
    hitObstacle: false,
    /** Текст сообщения о результате хода */
    turnResultText: "",
    /** Таймер паузы после завершения хода (в кадрах) */
    resultTimer: 0,
    /** Счет игрока */
    scoreLeft: 0,
    /** Счет бота */
    scoreRight: 0,
    /** Флаг: был ли зафиксирован гол */
    isGoalScored: false,
    /** Чей сейчас ход: 1 - Игрок, 2 - Бот */
    currentPlayer: 1,
    /** Камень, которым был сделан последний ход (для правила "не повторять биток") */
    lastUsedStriker: null,
    // === СОСТОЯНИЕ ИИ ===
    aiThinkingTimer: 0,
    aiAimTarget: null,
    aiSelectedStone: null,
    aiConsideredMoves: [],
};
/** Звуковой эффект удара камней */
export const hitSound = new Audio('assets/hit.mp3');
hitSound.addEventListener('error', () => { });
// ============================================================
// ШТРАФЫ И БОНУСЫ AI (регулируются слайдерами для отладки)
// ============================================================
/**
 * Штраф за риск фола при ударе.
 * Формула: risk² * riskPenaltyFactor
 * Чем больше значение, тем осторожнее бот избегает рискованных ударов.
 * По умолчанию: 4000
 */
export let riskPenaltyFactor = 4000;
/**
 * Штраф за избыточную силу удара.
 * Формула: (force/MAX_FORCE)² * forcePenaltyFactor
 * Чем больше значение, тем сильнее бот предпочитает слабые точные удары.
 * По умолчанию: 300
 */
export let forcePenaltyFactor = 300;
/**
 * Штраф за удар, траектория которого не проходит через ворота между камнями.
 * Огромный штраф, практически запрещающий такие удары.
 * По умолчанию: 10000
 */
export let gatesBlockPenalty = 10000;
/**
 * Штраф за удар, который не достигает линии ворот (слишком слабый).
 * Чуть меньше, чем gatesBlockPenalty, но всё равно огромный.
 * По умолчанию: 8000
 */
export let gatesReachPenalty = 8000;
/**
 * Бонус за продвижение камня к воротам соперника.
 * Формула: normalizedProgress² * advancementBonusFactor
 * Чем больше значение, тем агрессивнее бот продвигается вперёд.
 * По умолчанию: 3000
 */
export let advancementBonusFactor = 3000;
/**
 * Штраф за откат камня назад (дальше от ворот соперника).
 * Формула: backwardMovement² * retreatPenaltyFactor
 * Чем больше значение, тем сильнее бот избегает отступлений.
 * По умолчанию: 0.5
 */
export let retreatPenaltyFactor = 0.5;
/**
 * Штраф за отсутствие валидных проходов из будущей позиции.
 * Если из позиции нет ни одного прохода через ворота — этот штраф.
 * По умолчанию: 3000
 */
export let noValidPassesPenalty = 3000;
/**
 * Бонус за остроугольный треугольник с длинными сторонами.
 * Поощряет создание выгодной геометрии для следующих ударов.
 * По умолчанию: 1500
 */
export let triangleAcuteBonus = 1500;
/**
 * Штраф за тупоугольный треугольник.
 * По умолчанию: 2000
 */
export let triangleObtusePenalty = 2000;
/**
 * Бонус за возможность забить гол следующим ударом.
 * Формула: nextShotBonus * (1 - risk)
 * По умолчанию: 5000
 */
export let nextShotBonus = 5000;
/**
 * Бонус за возможность тактического прохода следующим ударом.
 * По умолчанию: 2000
 */
export let nextTacticalBonus = 2000;
/**
 * Инициализирует слайдеры штрафов AI.
 */
export function initAIPenaltiesSliders() {
    const sliders = [
        { id: 'riskPenaltySlider', variable: () => riskPenaltyFactor, setter: (v) => riskPenaltyFactor = v, display: 'riskPenaltyValue' },
        { id: 'forcePenaltySlider', variable: () => forcePenaltyFactor, setter: (v) => forcePenaltyFactor = v, display: 'forcePenaltyValue' },
        { id: 'gatesBlockPenaltySlider', variable: () => gatesBlockPenalty, setter: (v) => gatesBlockPenalty = v, display: 'gatesBlockPenaltyValue' },
        { id: 'advancementBonusSlider', variable: () => advancementBonusFactor, setter: (v) => advancementBonusFactor = v, display: 'advancementBonusValue' },
        { id: 'retreatPenaltySlider', variable: () => retreatPenaltyFactor, setter: (v) => retreatPenaltyFactor = v, display: 'retreatPenaltyValue' },
        { id: 'nextShotBonusSlider', variable: () => nextShotBonus, setter: (v) => nextShotBonus = v, display: 'nextShotBonusValue' },
    ];
    for (const config of sliders) {
        const slider = document.getElementById(config.id);
        const display = document.getElementById(config.display);
        if (!slider || !display)
            continue;
        // Устанавливаем значение из переменной
        slider.value = config.variable().toString();
        display.textContent = config.variable().toFixed(0);
        slider.addEventListener('input', () => {
            const value = parseFloat(slider.value);
            config.setter(value);
            display.textContent = value.toFixed(0);
            saveSettingsToCookie(); // Сохраняем
        });
    }
}
// ============================================================
// СОХРАНЕНИЕ НАСТРОЕК В COOKIES
// ============================================================
/**
 * Имя cookie для хранения настроек игры
 */
const SETTINGS_COOKIE_NAME = 'threeStonesSettings';
/**
 * Срок хранения cookie (1 год в секундах)
 */
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
/**
 * Сохраняет все настраиваемые параметры в cookie.
 * Вызывается при каждом изменении слайдера или чекбокса.
 *
 * ВАЖНО: Проверяет согласие пользователя перед сохранением.
 */
export function saveSettingsToCookie() {
    if (!cookiesAccepted) {
        // Если пользователь не дал согласия — не сохраняем
        return;
    }
    const settings = {
        spreadFactor,
        aiThinkingTime,
        alternateStriker,
        riskPenaltyFactor,
        forcePenaltyFactor,
        gatesBlockPenalty,
        advancementBonusFactor,
        retreatPenaltyFactor,
        nextShotBonus,
    };
    const json = JSON.stringify(settings);
    const encoded = encodeURIComponent(json);
    document.cookie = `${SETTINGS_COOKIE_NAME}=${encoded}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
}
/**
 * Загружает настройки из cookie и применяет их к переменным.
 * Вызывается один раз при старте игры, ДО инициализации слайдеров.
 *
 * @returns true, если настройки были успешно загружены
 */
export function loadSettingsFromCookie() {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === SETTINGS_COOKIE_NAME) {
            try {
                const json = decodeURIComponent(value);
                const settings = JSON.parse(json);
                // Применяем загруженные значения
                if (typeof settings.spreadFactor === 'number')
                    spreadFactor = settings.spreadFactor;
                if (typeof settings.aiThinkingTime === 'number')
                    aiThinkingTime = settings.aiThinkingTime;
                if (typeof settings.alternateStriker === 'boolean')
                    alternateStriker = settings.alternateStriker;
                if (typeof settings.riskPenaltyFactor === 'number')
                    riskPenaltyFactor = settings.riskPenaltyFactor;
                if (typeof settings.forcePenaltyFactor === 'number')
                    forcePenaltyFactor = settings.forcePenaltyFactor;
                if (typeof settings.gatesBlockPenalty === 'number')
                    gatesBlockPenalty = settings.gatesBlockPenalty;
                if (typeof settings.advancementBonusFactor === 'number')
                    advancementBonusFactor = settings.advancementBonusFactor;
                if (typeof settings.retreatPenaltyFactor === 'number')
                    retreatPenaltyFactor = settings.retreatPenaltyFactor;
                if (typeof settings.nextShotBonus === 'number')
                    nextShotBonus = settings.nextShotBonus;
                console.log('Настройки загружены из cookie:', settings);
                return true;
            }
            catch (e) {
                console.warn('Ошибка загрузки настроек из cookie:', e);
                return false;
            }
        }
    }
    return false;
}
// ============================================================
// СОГЛАСИЕ НА COOKIES
// ============================================================
/**
 * Флаг: дал ли пользователь согласие на использование cookies
 */
export let cookiesAccepted = false;
/**
 * Проверяет, дал ли пользователь согласие на cookies.
 * Показывает баннер ТОЛЬКО если согласие ещё не получено.
 */
export function checkCookieConsent() {
    const consent = localStorage.getItem('cookieConsent');
    if (consent === 'accepted') {
        cookiesAccepted = true;
        console.log('✓ Согласие на cookies получено ранее');
        // Баннер остаётся скрытым (класс hidden уже есть)
    }
    else if (consent === 'declined') {
        cookiesAccepted = false;
        console.log('✗ Пользователь отказался от cookies');
        // Баннер остаётся скрытым
    }
    else {
        // Согласие ещё не получено — ПОКАЗЫВАЕМ баннер
        console.log('? Требуется согласие на cookies — показываем баннер');
        showCookieBanner();
    }
}
/**
 * Показывает баннер согласия на cookies
 */
function showCookieBanner() {
    const banner = document.getElementById('cookieBanner');
    if (banner) {
        banner.classList.remove('hidden');
    }
}
/**
 * Скрывает баннер согласия на cookies
 */
function hideCookieBanner() {
    const banner = document.getElementById('cookieBanner');
    if (banner) {
        banner.classList.add('hidden');
    }
}
/**
 * Инициализирует обработчики кнопок баннера.
 * При нажатии кнопок баннер скрывается и выбор сохраняется.
 */
export function initCookieBanner() {
    const acceptBtn = document.getElementById('acceptCookies');
    const declineBtn = document.getElementById('declineCookies');
    if (acceptBtn) {
        acceptBtn.addEventListener('click', () => {
            cookiesAccepted = true;
            localStorage.setItem('cookieConsent', 'accepted');
            hideCookieBanner(); // Скрываем баннер
            saveSettingsToCookie(); // Сохраняем текущие настройки
            console.log('✓ Пользователь принял cookies');
        });
    }
    if (declineBtn) {
        declineBtn.addEventListener('click', () => {
            cookiesAccepted = false;
            localStorage.setItem('cookieConsent', 'declined');
            hideCookieBanner(); // Скрываем баннер
            // Удаляем cookies, если они были
            document.cookie = 'threeStonesSettings=; max-age=0; path=/';
            console.log('✗ Пользователь отказался от cookies');
        });
    }
}
/**
 * Функция начальной расстановки камней "от ворот".
 */
export function spawnAtGates(player) {
    const baseX = player === 1 ? 180 : canvas.width - 180;
    const direction = player === 1 ? 1 : -1;
    const groupOffsetY = (Math.random() - 0.5) * 80;
    const dist1 = 90 + Math.random() * 30;
    const dist2 = 90 + Math.random() * 30;
    stones[0].x = baseX;
    stones[0].y = canvas.height / 2 + groupOffsetY;
    stones[1].x = baseX + (direction * 55);
    stones[1].y = canvas.height / 2 - dist1 + groupOffsetY;
    stones[2].x = baseX + (direction * 55);
    stones[2].y = canvas.height / 2 + dist2 + groupOffsetY;
    stones.forEach(s => { s.vx = 0; s.vy = 0; s.isOut = false; });
    GameState.lastStruckStone = null;
    GameState.hasPassedThrough = false;
    GameState.hitObstacle = false;
    GameState.isGoalScored = false;
    GameState.resultTimer = 0;
    GameState.aiAimTarget = null;
    GameState.aiSelectedStone = null;
    GameState.aiConsideredMoves = [];
    GameState.lastUsedStriker = null;
}
export function initAlternateStrikerCheckbox() {
    const checkbox = document.getElementById('alternateStrikerCheckbox');
    if (!checkbox) {
        console.warn('Чекбокс правила не найден в DOM.');
        return;
    }
    // Устанавливаем состояние из переменной
    checkbox.checked = alternateStriker;
    checkbox.addEventListener('change', () => {
        alternateStriker = checkbox.checked;
        if (!alternateStriker) {
            GameState.lastUsedStriker = null;
        }
        saveSettingsToCookie(); // Сохраняем
    });
}
//# sourceMappingURL=state.js.map