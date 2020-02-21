var API_TOKEN = PropertiesService.getScriptProperties().getProperty("API_TOKEN");
var ADMIN_CHAT_ID = PropertiesService.getScriptProperties().getProperty("ADMIN_CHAT_ID");
var DAY_FORMAT = "dd.MM.yyyy";
var MINUTES_FORMAT = "HHmm";
var tableDays = Sheetfu.getTable("Days");
var tableSettings = Sheetfu.getTable("Settings");

/**
 * Привязка команд к их обработчикам
 */
var commands = {
  "start": startCommand,
  "update": updateCommand
};

// Обработка всех входящих запросов от бота
function doPost(e) {
  // Принимаем запрос
  var update = JSON.parse(e.postData.contents);
  var request = new Request(update);
  var chatId = request.getChatId();
  
  // Формируем и отправляем ответ
  var response = new BotMessage(chatId);  
  var responseText = route(request);
  var responseKeyboard = getKeyboard(request);
  response.send(responseText, responseKeyboard);
}

/**
 * Обработчики триггеров
 */

// Функция отправляет, если это необходимо, сообщение с вопросом, выполнил ли пользователь дневную задачу
// Предпочтительный метод запуска - с помощью триггера с частотой, подобранной под время запуска
function jobSendMessage(){
  if(!messageNeeded()){
    return; 
  }
  
  var todayDate = getNowDate(DAY_FORMAT);
  var newDay = {
    "day": todayDate
  };
  tableDays.add(newDay);
  tableDays.commit();
  
  var responseMessage = "Выполнил сегодня задачу?";
  var habitDescription = getSettingsValue("habit_desc");
  if(habitDescription){
    responseMessage += "\n" + bold(habitDescription);
  }
  
  var response = new BotMessage(ADMIN_CHAT_ID); 
  var keyboard = [[
    {"text": "Да", "callback_data": "/update " + todayDate + " 1"},
    {"text": "Нет", "callback_data": "/update " + todayDate + " 0"}
  ]];
  
  response.send(responseMessage, keyboard);
}

/**
 * Обработчики команд
 */

// Обработчик команды /start
function startCommand(){
  var habitDescription = getSettingsValue("habit_desc");
  var messageTime = getSettingsValue("message_time");
  
  // соберем строки в список, чтобы удобнее было их потом объединить
  var response = [];
  if(habitDescription){
    response.push("Цель: " + bold(habitDescription));
  }
  if(messageTime){
    messageTime = getTimeMinutes(messageTime);
    response.push("Время отчета: " + bold(messageTime.substring(2,0) + ':' + messageTime.slice(-2)));
  }
    
  // объединяем строки в одну ответную и возвращаем ее
  return response.join("\n");
}

// Обработчик команды /update
function updateCommand(params){
  var day = params[0];
  var completed = params[1];
  
  var dayRecordForUpdate = getDayRecordForUpdate(day);
  
  if(dayRecordForUpdate){
    dayRecordForUpdate.setFieldValue("completed", completed);
    tableDays.commit();
    
    var habitCompletedDays = getHabitCompletedDays(day);
    var habitDuration = getSettingsValue("habit_duration");
    
    if (completed == 1){
      if(habitDuration > habitCompletedDays){
        var response = "Молодец!\nТы завершил день " + bold(habitCompletedDays) + " из " + bold(habitDuration);
      } else if(habitDuration == habitCompletedDays) {
        var response = "Отлично!\nТы достиг цели и освоил новую привычку.\nНе забудь вознаградить себя за это!";
      } else {
        var response = "Молодец!\nТы завершил день " + bold(habitCompletedDays);
      }
    } else {
      if(habitDuration >= habitCompletedDays){
        var response = "Придется осваивать привычку заново :(";
      } else {
        var response = "Ничего страшного, привычка уже усвоена!";
      }
    }
    return response;
  } else {
    return "Время ответа еще не пришло";
  }
}

// Обработчик ситуаций, когда в сообщении нет команды или для команды нет обработчика
function defaultCommand(text){
  return "Неизвестная команда";
}

/**
 * Функции приложения
 */

// Возвращает значение настройки по имени параметра
function getSettingsValue(paramName){
  var records = tableSettings.items;
  var record = null;
  for(var i=0; i<records.length; i++){
    if(records[i].getFieldValue("name") == paramName){
      record = records[i]; 
    }
  }
  return record ? record.getFieldValue("value") : null;
}

// Возвращает значение настройки для времени отправки сообщения в удобном для сравнения формате целого числа
function getMessageTimeIntValue(){
  var time = getSettingsValue("message_time");
  if(time){
    time = getTimeMinutes(time);
    time = time.replace(":", "");
  }
  return parseInt(time);
}

// Форматирует текст для ответа жирным шрифтом 
function bold(text){
  return "<strong>" + text + "</strong>";
}

// Возвращает текущую таймзону
function getTimezone(){
  // При запуске из среды разработки таймзона не определена,
  // поэтому необходимо выставить таймзону по умолчанию (например, Europe/Moscow)
  try {
    var timeZone = AdsApp.currentAccount().getTimeZone();
  } catch(e){
    var timeZone = "Europe/Moscow";
  }
  return timeZone;
}

// Возвращает время в формате DAY_FORMAT 
function getTimeDay(time){
  var timeZone = getTimezone();
  return Utilities.formatDate(time, timeZone, DAY_FORMAT);
}

// Возвращает время в формате MINUTES_FORMAT 
function getTimeMinutes(time){
  var timeZone = getTimezone();
  return Utilities.formatDate(time, timeZone, MINUTES_FORMAT);
}

// Возвращает текущее время в заданном формате
function getNowDate(format){
  var now = new Date();
  var timeZone = getTimezone();
  return Utilities.formatDate(now, timeZone, format);
}

// Возвращает текущую дату
function getNowDay(){
  var now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Возвращает текущее время в формате ЧЧмм
function getNowTime(){
  return getNowDate(MINUTES_FORMAT);
}

// Вычисляет дату предыдущего дня относительно заданного
function subtractDay(day){
  var date = new Date(day.substring(6), parseInt(day.substring(3,5))-1, day.substring(0,2));
  var prevDate = new Date(date.getTime() - 24*3600*1000);
  return getTimeDay(prevDate);
}

// Возвращает последнюю запись истории привычки
function getLastDayRecord(){
  return tableDays.items[tableDays.items.length - 1];
}

// Возвращает true, если время для сообщения текущего дня уже пришло, но оно еще не отправлено 
function messageNeeded(){
  var messageTime = getMessageTimeIntValue();
  var nowTime = parseInt(getNowTime());
  var isTimeForUpdate = nowTime >= messageTime;
  
  var needMessage = messageTime != "" && isTimeForUpdate;
  if(!needMessage){
    return needMessage;
  }
  var lastDayRecord = getLastDayRecord();
  if(lastDayRecord){
    needMessage = !dayIsToday(lastDayRecord.getFieldValue("day"));
  }
  return needMessage;
}

// Возвращает запись с заданным необновленным днем или null, если такового не обнаружено
function getDayRecordForUpdate(day){
  var timeZone = getTimezone();
  var dayRecord = null;
  for(var i=0; i<tableDays.items.length; i++){
    var currentDay = getTimeDay(tableDays.items[i].getFieldValue("day"));
    if(currentDay == day){
      dayRecord = tableDays.items[i];
      break;
    }
  }
  
  if(dayRecord){
    if(dayRecord.getFieldValue("completed") === ""){
      return dayRecord;
    }
  }
  return null;
}

// Проверяет, что day - сегодняшний день
function dayIsToday(day){
  return day.getTime() == getNowDay().getTime();
}

// Считает число завершенных дней привычки
function getHabitCompletedDays(day){
  var daysEnded = false;
  var i = 0;
  var checkDay = day;
  var timeZone = getTimezone();
  
  while(!daysEnded){
    var tt = tableDays.items.length;
    var currentDayRecord = tableDays.items[tableDays.items.length - i - 1];
    if(!currentDayRecord){
      daysEnded = true;
      break;
    }
    var currentDay = getTimeDay(currentDayRecord.getFieldValue("day"));
    if(currentDay != checkDay || !currentDayRecord.getFieldValue("completed")){
      daysEnded = true;
      break;
    }
    i++;
    checkDay = subtractDay(checkDay);
  }
  
  return i;
}

/**
 * Служебные функции работы с входящими-исходящими запросами Telegram
 */

// Ищет обработчик запроса, полученного от бота
function route(request){
  if(request.getCommand() in commands && typeof commands[request.getCommand()]){
    return commands[request.getCommand()](request.getParams());
  } else {
    return defaultCommand(request.getParams());
  }
}

// Добавляет к ответу клавиатуры (кнопки)
function getKeyboard(request){
  var keyboard = null;
  return keyboard;
}

// Хранит данные о запросе бота
var Request = function(update){
  var command, params, chatId;
  
  if(update.hasOwnProperty('callback_query')){
    var callback = update.callback_query;
    var message = callback.data.toString();
    this.chatId = callback.message.chat.id;
  } else {
    var message = update.message.text.toString();
    this.chatId = update.message.chat.id;
  }
  var messageParts = message.split(' ');
  
  if (messageParts.length >= 1 && messageParts[0].indexOf('/') == 0) {
    this.command = messageParts.shift().substring(1);
    this.params = messageParts;
  } else {
    this.params = message;
  }
  
  this.getChatId = function(){
    return this.chatId;
  };
  
  this.getCommand = function(){
    return this.command;
  };
  
  this.getParams = function(){
    return this.params;
  };
};

// Отвечает за отправку сообщения в Telegram
var BotMessage = function(chatId){  
  this.chatId = String(chatId);
  
  this.send = function(text, keyboard) {
    var payload = {
      'method': 'sendMessage',
      'chat_id': this.chatId,
      'text': text,
      'parse_mode': 'HTML'
    };  
    if(keyboard){
      payload.reply_markup = JSON.stringify({'inline_keyboard': keyboard});
    }
    var data = {
      "method": "post",
      "payload": payload
    };
      
    try {
      var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + API_TOKEN + '/', data);
    } catch(e){
      Logger.log(e);
    }
  };
};
