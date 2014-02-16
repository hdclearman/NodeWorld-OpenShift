/*  
 *  Commands are called from the server only,
 *  to process data requests from the client,
 *  and send the results by socket.
 */

//*** MODULE DEPENDENCIES ***//

  //***  eval() is used, because the code is split into files for readability, only!  ***//
  
  if (require.cache[require.resolve('nodemailer')]) {
    delete require.cache[require.resolve('nodemailer')];
  }
  
  var nodemailer = require('nodemailer');
  
  // Clear cache, for a new copy.
  if (require.cache[require.resolve('./operations.js')]) {
    delete require.cache[require.resolve('./operations.js')];
  }
  
  var operations = require('./operations.js');
  
  // Have a local variable referring to each operation.
  for (var opName in operations) {
    eval('var ' + opName + ' = ' + operations[opName] + ';');
  }
  
  // Clear cache, for a new copy.
  if (require.cache[require.resolve('./worldFunctions.js')]) {
    delete require.cache[require.resolve('./worldFunctions.js')];
  }
  
  var worldFunctions = require('./worldFunctions.js');
  
  // Have a local variable referring to each operation.
  for (var functionName in worldFunctions) {
    eval('var ' + functionName + ' = ' + worldFunctions[functionName] + ';');
  }
  
  // Clear cache, for a new copy.
  if (require.cache[require.resolve('./adminFunctions.js')]) {
    delete require.cache[require.resolve('./adminFunctions.js')];
  }
  
  var adminFunctions = require('./adminFunctions.js');
  
  // Have a local variable referring to each function.
  for (var functionName in adminFunctions) {
    eval('var ' + functionName + ' = ' + adminFunctions[functionName] + ';');
  }
  
  // Clear cache, for a new copy.
  if (require.cache[require.resolve('./playerFunctions.js')]) {
    delete require.cache[require.resolve('./playerFunctions.js')];
  }
  
  var playerFunctions = require('./playerFunctions.js');
  
  // Have a local variable referring to each function.
  for (var functionName in playerFunctions) {
    eval('var ' + functionName + ' = ' + playerFunctions[functionName] + ';');
  }
// *** //

/*
 *  Commands are requested by the client.
 */

var commands = {}; // WARNING: Global variable from server.js is named 'command'!

// Server control.
commands.god = {
  // set PROPERTY VALUE
  'set': function (user, cmdArray, cmdStr) {
    // List world.config if only 'set' is sent.
    if (!cmdArray[1]) {
      user.socket.emit('info', '<pre><b>World configuration properties:</b><small>' + 
                      JSON.stringify(world.config, null, 2).replace(/\[|\]|{|}|,/gm, '')
                      .replace(/^\s*\n/gm, '') + '</small></pre>To reset to default, do: ' +
                      cmdChar + '<b>set reset</b>');
      return;
    }
    
    // Some fields may not be changed!
    if (cmdArray[1] == '_id') {
      user.socket.emit('warning', '<i>Cannot change this field!</i>');
      return;
    }
    
    // 'reset' to run configureWorld() again.
    if (cmdArray[1] == 'reset') {
      configureWorld();
      user.socket.emit('info', '<i>World configuration has been reset to default!</i>');
      return;
    }
    
    // MongoDB doesn't allow $ in fields.
    if (cmdArray[1].indexOf('$') >= 0) {
      user.socket.emit('warning', '<i>Property names cannot include the dollar sign!</i>');
      return;
    }
    
    // Default value is empty string.
    if (!cmdArray[2]) {
      cmdArray[2] = '';
    }
    
    // Convert dotted notation string into a real object.
    var value = cmdStr.substring(cmdStr.indexOf(" ") + 1); // Remove OBJECT.PROERTY part.
    var madeObject = objDotted(cmdArray[1], value);
    
    if (!madeObject) {
      user.socket.emit('warning', '<i>Failed to set the configuration (parsing)!</i>');
      return;
    }
    
    // Upsert (update existing and create non-existing properties) the data.
    updateObj(world.config, madeObject, true);

    world.changed.config = true;
    user.socket.emit('info', '<i>World configuration changed successfully.</i>');
  },
  /*  Sets a value into any world.config property, or 'reset' to default.
   */
  
  // resetworld
  'resetworld': function (user) {
    if (user.account.username != 'Koss') {
      user.socket.emit('warning', '<b>This command is not available to you.</b>');
      return;
    }
    
    resetWorld(user);
  },
  /*  Kicks all users from server, resets world object data,
   *  reset DB data, and make server available again.
   */
  
  // reloadcode
  'reloadcode': function (user) {
    if (user.account.username != 'Koss') {
      user.socket.emit('warning', '<b>This command is not available to you.</b>');
      return;
    }
    
    reloadCode(user);
  },
  /*  Reloads the commands.js code.
   */
  
  // kick USERNAME (MESSAGE)
  'kick': function (user, cmdArray) {
    if (!cmdArray[1]) {
      user.socket.emit('warning', 'Syntax: ' + cmdChar + 'kick USERNAME (MESSAGE)');
      return;
    }
    
    // Default message.
    var msg = 'You have been disconnected by ' + fullNameID(user) + '.';
    
    // Use custom message, instead.
    if (cmdArray[2] && cmdArray[2].trim()) {
      msg = cmdArray[2].trim();
    }
    
    var username = caseName(cmdArray[1]); // Make it case-compatibale for usernames, for example 'Bob'.
    
    // Find player by username in world.users.
    var targetUser = world.users[username];
    if (targetUser) {
      // Inform and kick target user.
      targetUser.socket.emit('warning', msg);
      targetUser.socket.disconnect();
      // Inform me of success.
      user.socket.emit('info', username + ' has been successfully disconnected.');
    } else {
      // Not found.
      user.socket.emit('warning', 'Username not found!');
    }
  }
  /*  Force a user to disconnect from server.
   *  MESSAGE defaults to 'You have been disconnected by fullNameID().'
   */
};

// World creation.
commands.builder = {
  // create NAME
  'create': function (user, cmdArray, cmdStr) {
    if (!cmdArray[1]) {
      user.socket.emit('warning', 'Syntax: ' + cmdChar + 'create NAME');
      return;
    }
    
    // Target name can only be English letters and spaces.
    var name = parseName(cmdStr); // True or false.
    if (!name) {
      user.socket.emit('warning', 'Creation names must be composed only of letters and spaces!');
      return;
    }
    
    var curRoom = user.room;
    
    // Create the target object.
    var targetObj = constructor.target(name, user.player.room);
    
    // Get the target with the highest id value.
    targetsdb.findOne({}, { fields: { '_id': 1 }, 'limit': 1 , 'sort': { '_id': -1 } },
                      function (err, doc) {
      if (err) {
        console.log(err);
        user.socket.emit('warning', '<i><b>Creation (counter) failed.</b></i>');
        return;
      }
      
      // id is 0 for first item, or last id + 1 for new id value.
      targetObj['_id'] = (!doc ? 0 : doc['_id'] + 1);
      // Instance 0 for first instance of a target in the world.
      targetObj.instance = 0;
      
      // Add the the target by '_id' to world targets.
      world.targets[targetObj['_id']] = {};
      world.targets[targetObj['_id']]['_id'] = targetObj['_id'];
      
      // Add first instance as instance '-1', for future duplication.
      var originalObj = copyObj(targetObj);
      originalObj.instance = '-1';
      world.targets[originalObj['_id']]['-1'] = originalObj;
      
      // Add the new target instance to the world.
      world.targets[targetObj['_id']]['0'] = targetObj;
      
      // Add the new target to the current room.
      curRoom.targets.push(targetObj);
      
      // Update DB immediately.
      saveTarget(originalObj);
      saveTarget(targetObj);
      saveRoom(curRoom);
      
      var fullID = strTarget(targetObj);
      
      var strCoord = strPos(curRoom.position);
      
      // Inform all (including me) in the room about the new target.
      for (var i=0; i < world.watch[strCoord].length; i++) {
        world.watch[strCoord][i].socket.emit('info',
                '<i><b>Creation #' + fullID + ' has been successful.' + '<br />' + 
                'Its\' template can be changed through instance \'-1\'.</b></i>');
      }
    })
  },
  /*  Creates a new target where the player stands.
   */
  
  // destroy (ID).(INSTANCE)
  'destroy': function (user, cmdArray) {
    var strCoord = strPos(user.player.room);
    
    if (!cmdArray[1]) {
      user.socket.emit('warning', '<i>Syntax: ' + cmdChar + 'destroy ID.INSTANCE</i>');
      return;
    }
    
    // Parse target.
    var parsedTarget = parseTarget(cmdArray[1]);
    if (!parsedTarget) {
      user.socket.emit('warning', '<i>Target must be a numeric value, for example: ' +
                                  cmdChar + 'destroy 0.1</i>');
      return;
    }
    
    var idInst = parsedTarget.split('.');
    
    // Remove last target from targets.
    if (!idInst[0]) {
      if (user.room.targets.length > 0) {
        var curTarget = user.room.targets[user.room.targets.length-1];
        var i = user.room.targets.length-1;
        
        // Save target's fullNameID for message.
        var targetName = fullNameID(curTarget);
        
        destroyTarget(user, curTarget, i); // Remove from room, world & DB.
        
        // Inform all (including me) in the room about the removed target.
        for (var i=0; i < world.watch[strCoord].length; i++) {
          world.watch[strCoord][i].socket.emit('info', '<i><b>Creation ' + targetName
                                                          + ' has been successfully destroyed.</b></i>');
        }
        
        return;
      }
      
      // Nothing to remove.
      user.socket.emit('warning', '<i><b>No targets in the room.</b></i>');
      return;
    }
    
    // Make sure ID is a number.
    if (isNaN(idInst[0])) {
      user.socket.emit('warning', '<i><b>Target ID must be a number!</b></i>');
      return;
    }
    
    // Remove last instance of target by ID.
    if (idInst[0] && !idInst[1]) {
      // Loop from last, and remove first found instance.
      for (var i = user.room.targets.length - 1; i >= 0; i--) {
        var curTarget = user.room.targets[i];
        
        if (curTarget['_id'] == idInst[0]) {
          // Save target's fullNameID for message.
          var targetName = fullNameID(curTarget);
          
          destroyTarget(user, curTarget, i); // Remove from room, world & DB.
          
          // Inform all (including me) in the room about the removed target.
          for (var i=0; i < world.watch[strCoord].length; i++) {
            world.watch[strCoord][i].socket.emit('info', '<i><b>Creation ' + targetName
                                                          + ' has been successfully destroyed.</b></i>');
          }
          
          return;
        }
      }
      
      // Target not found.
      user.socket.emit('warning', '<i><b>Target #' + idInst[0] + '.' +
                                  idInst[1] + ' was not found.</b></i>');
      return;
    }
    
    // Make sure instance is a number.
    if (isNaN(idInst[1])) {
      user.socket.emit('warning', '<i><b>Target instance must be a number!</b></i>');
      return;
    }
    
    // Or remove target by both ID and instance.
    for (var i=0; i < user.room.targets.length; i++) {
      var curTarget = user.room.targets[i];
      
      if (curTarget['_id'] == idInst[0] && 
          curTarget.instance == idInst[1]) {
        // Save target's fullNameID for message.
        var targetName = fullNameID(curTarget);
        
        destroyTarget(user, curTarget, i); // Remove from room, world & DB.
      
        // Inform all (including me) in the room about the removed target.
        for (var i=0; i < world.watch[strCoord].length; i++) {
          world.watch[strCoord][i].socket.emit('info', '<i><b>Creation ' + targetName
                                                          + ' has been successfully destroyed.</b></i>');
        }
        
        return;
      }
    }
    
    // Otherwise, target was not found.
    user.socket.emit('warning', '<i><b>Target #' + idInst[0] + '.' + idInst[1] +
                                ' was not found.</b></i>');
  }
  /*  Removes a target from current room, last one in targets by default,
   *  or instance, last one by default.
   */
};

// World manipulation.
commands.master = {
  // modify room/ID(.INSTANCE) FIELD(.FIELD) VALUE
  'modify': function (user, cmdArray, cmdStr) {
    if (!cmdArray[1] || !cmdArray[2]) {
      user.socket.emit('warning', '<i>Syntax: ' + cmdChar + 'modify room/ID FIELD VALUE</i>');
      return;
    }
    
    // Handle VALUE.
    if (!cmdArray[3]) {
      cmdArray[3] = '';
      cmdStr = '';
    } else {
      // Remove the here/ID and FIELD words from the string.
      for (var i=0; i < 2; i++) {
        cmdStr = cmdStr.substring(cmdStr.indexOf(" ") + 1); // VALUE, string of many words.
      }
    }
    
    var field = cmdArray[2].toLowerCase(); // Field is case-insensitive.

    // Do this for room and leave.
    if (cmdArray[1].toLowerCase() == 'room') {
      modifyRoom(user, field, cmdStr);
      return;
    }
    
    // Otherwise, this is a target.
    var idInstance = parseTarget(cmdArray[1]);
    
    if (!idInstance) {
      user.socket.emit('warning', '<i>Target must be a number, such as \'0.0\'!</i>');
      return;
    }
    
    var idInstArray = idInstance.split('.');
    var id = idInstArray[0];
    var inst = idInstArray[1];
    
    // Original instance '-1' can be changed from anywhere.
    if (inst == '-1') {
      var curTarget = world.targets[id];
      
      // In case target is not loaded into world.targets object.
      if (!curTarget) {
        var fieldValueArray = [];
        fieldValueArray[0] = field;
        fieldValueArray[1] = cmdStr;
        
        loadTarget(user, idInstance, 'modify', fieldValueArray);
        return;
      }
      
      curTarget = curTarget['-1']; // Get original instance.
      
      modifyTarget(user, field, cmdStr, curTarget);
      return;
    }
    
    // Find the target ID and instance in this room.
    for (var i=0; i < user.room.targets.length; i++) {
      var curTarget = user.room.targets[i];
      
      if (curTarget['_id'] == id && curTarget['instance'] == inst) {
        var curTarget = user.room.targets[i];
        
        modifyTarget(user, field, cmdStr, curTarget);
        return;
      }
    }
    
    user.socket.emit('warning', '<i>Could not find creation [' + idInstance + '] here.</i>');
  },
  /*  Modify an existing field in current room or target,
   *  or toggle an available object property (e.g. worn) or array item (e.g. commands).
   *  VALUE can be many words. Instance -1 is a special case, here.
   */
};

// Registered users, only.
commands.player = {
  // email
  'email': function (user) {
    // Try the socket user object for the data.
    if (user.account.email) {
      user.socket.emit('info', '<i>eMail for user ' + user.account.username + 
                        ' is: ' + user.account.email + '</i>');
      return;
    }
  },
  /*  Display email address.
   */
  
  // logout
  'logout': function (user) {
    // Remove reference to user from changed queue.
    world.changed.users.splice(world.changed.users.indexOf(user), 1);
    
    // Update 'lastonline'.
    user.account.lastonline = new Date();
    
    // Copy relevant user data, for saving queue.
    var userCopy = {};
    userCopy.account = copyObj(user.account);
    userCopy.player = copyObj(user.player);
    if (user['_id']) userCopy['_id'] = user['_id'];     // If a none logged-in user, somehow, reached here.
    
    // Add to saving queue.
    world.changed.users.push(userCopy);
    
    // Continue into logging out...
    var oldName = user.player.name;
    
    var newUser = {};
    newUser.account = {};
    newUser.player = {};
    
    newUser.account.username = randomName();
    newUser.player.name = newUser.account.username;
    
    // Copy player position.
    newUser.player.map = user.player.map;
    newUser.player.room = copyObj(user.player.room);    // { 'x': X, 'y': Y, 'z': Z }
    
    newUser.account.access = 'user';            // Reset access level.
    
    updateUser(user, newUser);
    
    delete user['_id'];                         // Irrelevant for unregistered users.
    
    user.socket.emit('info', '<i>You have changed your name to <b>' + user.player.name + '</b>.</i>');
    // And alert everyone about this...
    user.socket.broadcast.emit('info', '<i>' + oldName + ' is now known as ' + 
                                                        user.player.name + '.</i>');
  },
  /*  Logout from current logged-in user account,
   *  and replace account.username & player.name with a randomName(), updating user.name.
   */
  
  // wear TARGET
  'wear': function (user, cmdArray) {
    if (!cmdArray[1]) {
      user.socket.emit('warning', '<i>Syntax: ' + cmdChar + 'wear TARGET</i>');
      return;
    }
    
    // TARGET must be a number.
    var parsedTarget = parseTarget(cmdArray[1]);
    if (!parsedTarget) {
      user.socket.emit('warning', '<i>Target must be a number, such as \'0.0\'!</i>');
      return;
    }
    
    var idInst = parsedTarget.split('.');
    
    // Load target data from DB, if not loaded, yet.
    // This should only be for items on players or targets.
    if (!world.targets[idInst[0]] || !world.targets[idInst[0]][idInst[1]]) {
      loadTarget(user, parsedTarget, 'wear');
    } else {
      // Try to hold existing target.
      wearTarget(user, world.targets[idInst[0]][idInst[1]]); // loadTarget makes this call, as well.
    }
  },
  /*  Wear an item from the room or hands.
   */
  
  // remove TARGET
  'remove': function (user, cmdArray) {
    if (!cmdArray[1]) {
      user.socket.emit('warning', '<i>Syntax: ' + cmdChar + 'remove TARGET</i>');
      return;
    }
    
    // TARGET must be a number.
    var parsedTarget = parseTarget(cmdArray[1]);
    if (!parsedTarget) {
      user.socket.emit('warning', '<i>Target must be a number, such as \'0.0\'!</i>');
      return;
    }
    
    var idInst = parsedTarget.split('.');
    
    // Load target data from DB, if not loaded, yet.
    // This should only be for items on players or targets.
    if (!world.targets[idInst[0]] || !world.targets[idInst[0]][idInst[1]]) {
      loadTarget(user, parsedTarget, 'remove');
    } else {
      // Try to remove existing target.
      removeTarget(user, world.targets[idInst[0]][idInst[1]]); // loadTarget makes this call, as well.
    }
  },
  /*  Remove a worn item and hold if possible, or drop to room.
   */
  
  // hold TARGET (HAND)
  'hold': function (user, cmdArray) {
    if (!cmdArray[1]) {
      user.socket.emit('warning', '<i>Syntax: ' + cmdChar + 'hold TARGET (HAND)</i>');
      return;
    }
    
    // TARGET must be a number.
    var parsedTarget = parseTarget(cmdArray[1]);
    if (!parsedTarget) {
      user.socket.emit('warning', '<i>Target must be a number, such as \'0.0\'!</i>');
      return;
    }
    
    var idInst = parsedTarget.split('.');
    
    // Parse hand.
    var hand = '';
    if (cmdArray[2]) hand = cmdArray[2].toLowerCase();
    
    // Load target data from DB, if not loaded, yet.
    // This should only be for items on players or targets.
    if (!world.targets[idInst[0]] || !world.targets[idInst[0]][idInst[1]]) {
      loadTarget(user, parsedTarget, 'hold', hand);
    } else {
      // Try to hold existing target.
      holdTarget(user, world.targets[idInst[0]][idInst[1]], hand); // loadTarget makes this call, as well.
    }
  },
  /*  Hold an item from the room in an empty hand, randomly or selected.
   */
  
  // drop TARGET
  'drop': function (user, cmdArray) {
    if (!cmdArray[1]) {
      user.socket.emit('warning', '<i>Syntax: ' + cmdChar + 'drop TARGET</i>');
      return;
    }
    
    // TARGET must be a number.
    var parsedTarget = parseTarget(cmdArray[1]);
    if (!parsedTarget) {
      user.socket.emit('warning', '<i>Target must be a number, such as \'0.0\'!</i>');
      return;
    }
    
    var idInst = parsedTarget.split('.');
    
    // Load target data from DB, if not loaded, yet.
    // This should only be for items on players or targets.
    if (!world.targets[idInst[0]] || !world.targets[idInst[0]][idInst[1]]) {
      loadTarget(user, parsedTarget, 'drop');
    } else {
      // Drop existing target.
      dropTarget(user, world.targets[idInst[0]][idInst[1]]); // loadTarget makes this call, as well.
    }
  },
  /*  Drop an item to the room, either from hands or worn.
   */
  
  // examine (PLAYER)
  'examine': function (user, cmdArray) {
    // By default examine myself.
    if (!cmdArray[1]) {
      user.socket.emit('info', '<i>Examining yourself...</i><br /><pre>' + 
                        JSON.stringify(user.player, null, 2)
                        .replace(/[\[\]{}]/g, '') + '</pre>');
      return;
    }
    
    // Capitalize first letter and lower-case the rest.
    var fixedName = caseName(cmdArray[1]);
    
    // Locate the username in current room.
    for (var i=0; i < world.watch[strPos(user.player.room)].length; i++) {
      var curPlayer = world.watch[strPos(user.player.room)][i];
      
      if (curPlayer.account.name == fixedName) {
        user.socket.emit('info', '<i>Examining ' + fullNameID(curPlayer) + '...</i><br /><pre>' + 
                                          JSON.stringify(curPlayer.player.worn, null, 2)
                                          .replace(/[\[\]{}]/g, '') + '</pre>');
        return;
      }
    }
    
    // Otherwise, player was not found.
    user.socket.emit('warning', '<i>Player ' + cmdArray[1] + ' was not found in this room.</i>');
  },
  /*  Examine the properties of players, or myself by default.
   */
  
  // offer TARGET ITEM (ITEM) ...
  'offer': function (user, cmdArray, cmdStr) {
    if (!cmdArray[1] || !cmdArray[2]) {
      user.socket.emit('warning', '<i>Syntax: ' + cmdChar + 
                        'offer TARGET/ANYONE ITEM(,AMOUNT) (ITEM)(,AMOUNT) ...</i>');
      return;
    }
    
    var items = cmdStr.substring(cmdStr.indexOf(" ") + 1);   // Remove TARGET from string.
    items = items.split(' ');    // An array of the items.
    
    // Parse items as targets.
    for (var i=0; i < items.length; i++) {
      var curItem = items[i];
      
      var parsedItem = parseTarget(curItem);
      
      // Item failed parsing as target.
      if (!parsedItem) {
        user.socket.emit('warning', '<i>Items must be formatted as ID.INSTANCE, such as \'0.0\'.</i>');
        return;
      }
      
      // Replace item with its' parsed version.
      items[i] = parsedItem;
    }
    
    offerItems(user, cmdArray[1], items);
  },
  /*  Offer a target or another player an item or items by ID.INSTANCE
   *  that I have available in my hands.
   */
  
  // cancel OFFER
  'cancel': function (user, cmdArray) {
    if (!cmdArray[1]) {
      user.socket.emit('warning', '<i>Syntax: ' + cmdChar + 'cancel OFFER</i>');
      return;
    }
    
    var offer = parseInt(cmdArray[1]);
    
    // OFFER must be an integer number.
    if (isNaN(offer)) {
      user.socket.emit('warning', '<i>Offer must be a number!</i>');
      return;
    }
    
    cancelOffer(user, offer);
  },
  /*  Cancel an existing offer,
   *  by its' current index number.
   */
  
  // accept TARGET (OFFER)
  'accept': function (user, cmdArray) {
    if (!cmdArray[1]) {
      user.socket.emit('warning', '<i>Syntax: ' + cmdChar + 'accept TARGET (OFFER)</i>');
      return;
    }
    
    // A specific offer has been requested.
    if (cmdArray[2]) {
      acceptItems(user, cmdArray[1], cmdArray[2]);
      return;
    }
    
    // Accept first available offer.
    acceptItems(user, cmdArray[1]);
  },
  /*  Accept an offer of items from a target or player,
   *  either by index, or the first (lowest index) available offer!
   */
  
  // attack TARGET
  'attack': function () {
    // EMPTY
  }
  /*  EMPTY
   *  
   */
};

commands.user = {
  // chat MESSAGE
  'chat': function (user, cmdArray, cmdStr) {
    var msg = cmdStr.trim();      // Remove surrounding spaces.
    
    if (!msg) {
      user.socket.emit('warning', '<i>Syntax: ' + cmdChar + 'chat MESSAGE</i>');
      return;
    }
    
    // Limit chat messages to 200 characters.
    if (msg.length > 200) {
      user.socket.emit('warning', 'You cannot chat a message more than two-hundred characters long.');
      return;
    }
    
    // Limit chat messages to 3 in every 10 seconds.
    if (!user.chatLimit) {
      user.chatLimit = {
        'count': 1
      };
      // Start cooldown timer.
      user.chatLimit.timer = setTimeout(function () {
        delete user.chatLimit;
      }, 10000)
    } else {
      user.chatLimit.count += 1;
      
      if (user.chatLimit.count > 3) {
        user.socket.emit('warning', 'You cannot chat more than three messages in every ten second period.');
        return;
      }
    }
    
    // Send to all others.
    user.socket.broadcast.emit('message', fullNameID(user) + ': ' + msg);
    
    // Show me.
    user.socket.emit('message', '<b>You</b>: ' + msg);
  },
  /*  Speak to everyone in the world/server.
   */
  
  // say MESSAGE
  'say': function (user, cmdArray, cmdStr) {
    var msg = cmdStr.trim();
    
    if (!msg) {
      user.socket.emit('warning', '<i>Syntax: ' + cmdChar + 'say MESSAGE</i>');
      return;
    }
    
    // Limit chat messages to 200 characters.
    if (msg.length > 100) {
      user.socket.emit('warning', 'You cannot say a message more than one-hundred characters long.');
      return;
    }
    
    // Limit say messages to 5 in every 10 seconds.
    if (!user.sayLimit) {
      user.sayLimit = {
        'count': 1
      };
      // Start cooldown timer.
      user.sayLimit.timer = setTimeout(function () {
        delete user.sayLimit;
      }, 10000)
    } else {
      user.sayLimit.count += 1;
      
      if (user.sayLimit.count > 5) {
        user.socket.emit('warning', 'You cannot say more than five messages in every ten second period.');
        return;
      }
    }
    
    // Speak to the room, only.
    for (var i=0; i < world.watch[strPos(user.player.room)].length; i++) {
      var curPlayer = world.watch[strPos(user.player.room)][i];
      
      if (curPlayer.account.username != user.account.username) {
        // Show my message to others.
        curPlayer.socket.emit('message', fullNameID(user) + ' says: ' + msg);
      } else {
        // Show me my message.
        user.socket.emit('message', '<b>You say:</b> ' + msg);
      }
    }
  },
  /*  Speak to the room.
  */
  
  // tell USERNAME MESSAGE
  'tell': function (user, cmdArray, cmdStr) {
    // Remove USERNAME part and surrounding spaces,
    // or false, if no space after USERNAME.
    var msg = (cmdStr.indexOf(" ") >= 0 ? cmdStr.substring(cmdStr.indexOf(" ") + 1).trim() : false);
    
    // Either check for having two arguments, or an argument and a msg.
    if (!cmdArray[1] || !msg) {
      user.socket.emit('warning', '<i>Syntax: ' + cmdChar + 'tell USERNAME MESSAGE</i>');
      return;
    }
    
    // Cannot tell myself.
    if (cmdArray[1] == user.account.username) {
      user.socket.emit('warning', '<i>You cannot tell yourself anything!</i>');
      return;
    }
    
    var username = caseName(cmdArray[1]); // Make it case-compatibale for usernames, for example 'Bob'.
    
    // Find player by username in world.users.
    var targetUser = world.users[username];
    if (targetUser) {
      // Tell targret player.
      targetUser.socket.emit('tell', fullNameID(user) + ' tells you: ' + msg);
      // Show me the message.
      user.socket.emit('tell', '<b>You tell ' + fullNameID(targetUser) + ':</b> ' + msg);
    } else {
      // Not found.
      user.socket.emit('warning', '<i>Username not found!</i>');
    }
  },
  /*  Speak to another player, anywhere in the world.
  */
  
  // move DIRECTION
  'move': function (user, cmdArray) {
    if (!cmdArray[1] || cmdArray[2]) {
      user.socket.emit('warning', '<i>Syntax: ' + cmdChar + 'move DIRECTION</i>');
      return;
    }
    
    // Convert direction to coordinates.
    var curPos = user.player.room;
    var newPos = {};
    
    // Parse direction to new position. Returns false on failure.
    newPos = posDir(curPos, cmdArray[1].toLowerCase());

    /* ACTIVE ONLY FOR NON-BUILDERS
    var check = false; // Assume movement not possible.
    
    // Check that the exit exists in the current room.
    for (var i=0; i < user.room.exits.length; i++) {
      if (user.room.exits[i] == cmdArray[1]) {
        check = true;
      }
    }
    if (!check) {
      socket.emit('warning', '<i>Exit not found!</i>');
      return;
    } */
    
    // Check that the exit is open.
    // N/A.
    
    // Move.
    if (newPos) {
      user.player.room = newPos;
      user.socket.emit('info', '<i>Moving to position ' + JSON.stringify(newPos) + '.</i>');
      loadRoom(user);
      return;
    }
    
    user.socket.emit('warning', '<i>Exit not found!</i>');
  },
  /*  Asks to move to a new position in the same map.
  */
  
  // emote ACTION (TARGET)
  'emote': function (user, cmdArray) {
    if (!cmdArray[1]) {
      // Get a list of all available emotes.
      var emotes = '';
      for (emote in world.config.emotes) {
        emotes += emote + ', ';
      }
      emotes = emotes.slice(0, emotes.length-2);  // Remove last ', '
      
      user.socket.emit('info', 'The emotes available to you are:<br />' +
                                  '<i>' + emotes + '.</i>');
      return;
    }
    
    // Find emote.
    var curEmote = world.config.emotes[cmdArray[1]];
    if (!curEmote) {
      user.socket.emit('warning', '<i>Emote ' + cmdArray[1].toLowerCase() + ' not found!</i>');
      return;
    }
    
    // Options: curEmote.room.me/others           (at no one)
    //          curEmote.self.me/others           (at myself)
    //          curEmote.player.me/player/others  (at another player)
    //          curEmote.target.me/others         (at a target)
    
    // Emote to the room at-large.
    if (!cmdArray[2]) {
      // Show me the emote.
      user.socket.emit('emote', curEmote.room.me.replace('USER', user.player.name));
      
      // Show other players in the room.
      for (var i=0; i < world.watch[strPos(user.player.room)].length; i++) {
        var curUser = world.watch[strPos(user.player.room)][i];
        
        // Send with each user socket, except myself.
        if (curUser.account.username != user.account.username) {
          curUser.socket.emit('emote', curEmote.room.others.replace('USER', user.player.name));
        }
      }
      
      return;
    }
    
    // Emote at a target or user.
    // In the special case of emoting to myself.
    if (caseName(cmdArray[2]) == user.account.username) {
      user.socket.emit('emote', curEmote.self.me.replace('USER', user.player.name));
      
      // Show other players in the room.
      for (var i=0; i < world.watch[strPos(user.player.room)].length; i++) {
        var curUser = world.watch[strPos(user.player.room)][i];
        
        // Send with each user socket, except myself.
        if (curUser.account.username != user.account.username) {
          curUser.socket.emit('emote', curEmote.self.others.replace('USER', user.player.name));
        }
      }
      
      return;
    }
    
    // Find the target or user in the room.
    var emoteTarget = false;
    // Try to find a user.
    for (var i=0; i < world.watch[strPos(user.player.room)].length; i++) {
      var curUser = world.watch[strPos(user.player.room)][i];
      
      if (curUser.account.username == caseName(cmdArray[2])) {
        emoteTarget = curUser.socket; // Refer to the socket.
        break;
      }
    }
    // If not found user, then try to find a target.
    if (!emoteTarget) {
      var arrTargets = world.maps[user.player.map].rooms[strPos(user.player.room)].targets;
      for (var i=0; i < arrTargets.length; i++) {
        var curTarget = arrTargets[i];
        
        var idInst = strTarget(curTarget);
        if (idInst == cmdArray[2]) {
          emoteTarget = curTarget;
          break;
        }
      }
    }
    // Otherwise, leave.
    if (!emoteTarget) {
      user.socket.emit('warning', '<i>Could not find ' + cmdArray[2] + ' here!</i>');
      return;
    }
    
    // Player emote or target emote.
    if (!emoteTarget.instance) {
      // Show me the emote.
      user.socket.emit('emote', curEmote.player.me.replace('USER2', caseName(cmdArray[2])));
      // Show the other player the emote.
      emoteTarget.emit('emote', curEmote.player.player.replace('USER1', user.player.name));
      // Show others the emote.
      for (var i=0; i < world.watch[strPos(user.player.room)].length; i++) {
        var curUser = world.watch[strPos(user.player.room)][i];
        
        // Send with each user socket, except myself and emoteTarget player.
        if (curUser.account.username != user.account.username &&
            curUser.account.username != caseName(cmdArray[2])) {
          curUser.socket.emit('emote', curEmote.player.others.replace('USER1', user.player.name)
                                                               .replace('USER2', caseName(cmdArray[2])));
        }
      }
    } else {
      // Show me the emote.
      user.socket.emit('emote', curEmote.target.me.replace('TARGET', emoteTarget.name));
      
      // Show other players in the room.
      for (var i=0; i < world.watch[strPos(user.player.room)].length; i++) {
        var curUser = world.watch[strPos(user.player.room)][i];
        
        // Send with each user socket, except myself.
        if (curUser.account.username != user.account.username) {
          curUser.socket.emit('emote', curEmote.target.others.replace('USER', user.player.name)
                                                               .replace('TARGET', emoteTarget.name));
        }
      }
    }
  },
  /*  Act an emotion or gesture generally or towards a target or player.
  */

  // look (TARGET)
  'look': function (user, cmdArray) {
    var curRoom = user.room;
    var strCoord = strPos(curRoom.position);
    
    // Just look at the current room.
    if (!cmdArray[1]) {
      // Defaults.
      var title = ( !curRoom.title || curRoom.title == '' ? 'Unknown Room' : curRoom.title );
      
      var players = '';
      for (var i=0; i < world.watch[strCoord].length; i++) {
        players += fullNameID(world.watch[strCoord][i]) + ', ';
      }
      players = players.slice(0, -2); // Remove last ', '.
      players += '.'; // Finish with a period.
      
      var targets = '';
      for (var i=0; i < curRoom.targets.length; i++) {
        targets += fullNameID(curRoom.targets[i]) + ', ';
      }
      targets = ( !targets ? 'Nothing.' : targets.slice(0, -2) ); // Remove last ', '.
      
      var description = 'None';
      if (curRoom.description && curRoom.description != '') {
        description = curRoom.description;
      }
      
      var commands = ( curRoom.commands.length == 0 ? 'None.' : curRoom.commands.join(', ') + '.' );
      var exits = ( curRoom.exits.length == 0 ? 'None.' : curRoom.exits.join(', ') + '.' );
      
      user.socket.emit('info', '<b>Title: ' + title + '</b><br />' + 
        'Map: '         + curRoom.map + '<br />' +
        'Players: '     + players     + '<br />' +
        'Targets: '     + targets     + '<br />' +
        'Description: ' + description + '<br />--------------------<br />' +
        'Commands: '    + commands    + '<br />' +
        'Exits: '       + exits       + '<br />');
      
      return;
    }
     
    // Find the target in the current room, by name (case insensitive),
    // by id/id.instance, or by partial string match (case insensitive) 
    // inside target name (e.g: 'stick' -> 'Lots of Funny Sticks').
    for (var i=0; i < curRoom.targets.length; i++) {
      if (cmdArray[1] == strTarget(curRoom.targets[i]) ||
          cmdArray[1] == curRoom.targets[i]['_id'] ||
          cmdArray[1].toLowerCase() == curRoom.targets[i].name.toLowerCase() ||
          curRoom.targets[i].name.toLowerCase().search(cmdArray[1].toLowerCase()) >= 0) {
        
        var curTarget = curRoom.targets[i];
        
        // Create the display text.
        var targetText = '';
        /*
        for (var propertyName in curTarget) {
          var curProperty = curTarget[propertyName];
          
          // Options: [object Array], [object String], [object Object]
          var propertyData = '';
          switch (toType(curProperty)) {
            case '[object String]':
              propertyData = '\"' + curProperty + '\"';
              break;
            
            case '[object Array]':
              propertyData = '[' + curProperty.join(', ') + ']';
              break;
            
            case '[object Object]':
              propertyData = '<pre style="font-size: 80%; display: inline;">' +
                              JSON.stringify(curProperty, null, 2) + '</pre>';
              break;
            
            default:
              propertyData = curProperty;
          }
          
          targetText += '<b>' + propertyName + ':</b> ' +  propertyData + '<br />';
        }*/
        
        var commands = ( curTarget.commands.length == 0 ? 'None.' : curTarget.commands.join(', ') + '.' );
        
        // Display target data.
        user.socket.emit('info', '<b>' + fullNameID(curTarget)  + '</b><br />' + 
        'Description: '   + curTarget.description               + '<br />' +
        'Position: '      + JSON.stringify(curTarget.position)  + '<br />' +
        'Commands: '      + commands                            + '<br />' +
        'Size: '          + curTarget.size                      + '<br />--------------------<br />' +
        'Trade: '         + JSON.stringify(curTarget.trade)     + '<br />');
        
        
        // user.socket.emit('info', targetText + '<br />');
        return;
      }
    }
    
    // Otherwise, target not found.
    user.socket.emit('warning', '<i>Target #' + cmdArray[1] + ' not found.</i>');
  },
  /*  Displays a target data. Shows the current room data,
   *  if sent without arguments.
  */

  // rename NAME
  'rename': function (user, cmdArray) {
    // Make sure there is actually a name to change into.
    if (!cmdArray[1]) {
      user.socket.emit('warning', '<i>Syntax: ' + cmdChar + 'rename NAME</i>');
      return;
    }
    
    // Exceptions to accepted names.
    var testName = cmdArray[1].toLowerCase().trim();
    var exceptions = ['you', 'me', 'it', 'we', 'us', 'he', 'she', 'them', 'they', 'those', 'these'];
    if (exceptions.indexOf(testName) >= 0) {
      user.socket.emit('warning', '<i><b>' + caseName(cmdArray[1]) + 
                                  '</b> cannot be used as a name!</i>');
      return;
    }

    // Should return false to continue here.
    var tryParse = parseUsername(cmdArray[1]);
    if (tryParse) {
      user.socket.emit('warning', tryParse); // Error.
      return;
    }

    // Returns a name with first letter uppercase and the rest lowercase.
    var fixedName = caseName(cmdArray[1]);
    
    // Save old name to alert everyone of this change.
    var oldName = user.player.name;
    
    // Logged-in users only change their player.name & user.name.
    if (user.account.registered) {
      user.player.name = fixedName;
      user.name = fullName(user); // pre + name + post.
      
      var newUser = {};
      newUser.player = {};
      
      newUser.player.name = fixedName;    // Assign new player name.
      
      updateUser(user, newUser); // Update!
      
      user.socket.emit('info', '<i>You have changed your name to <b>' + user.player.name + '</b>.</i>');
      // And alert everyone about this...
      user.socket.broadcast.emit('info', '<i><b>' + oldName + '</b> is now known as </i><b>' + 
                                                                      user.player.name + '</b>.');
      
      return;
    }
    
    // Check if username is not one of the available randomName() options.
    if (randomName(fixedName)) {
      user.socket.emit('warning', '<i>' + fixedName + ' cannot be used as a username!</i>');
      return;
    }
    
    // Check if username is already registered - for unregistered users.
    usersdb.findOne({ 'account.username': fixedName }, function (e, acct) {
      if (acct) {
        user.socket.emit('warning', '<i>Username ' + fixedName + ' is already registered!</i>');
        return;
      }
      
      // Unregistered users also change their account.username.
      var newUser = {};
      newUser.account = {}; newUser.player = {};
      
      newUser.account.username = fixedName;               // Assign new name.
      newUser.player.name = newUser.account.username;     // ...
      
      // Copy player position.
      newUser.player.map = user.player.map;
      newUser.player.room = user.player.room;
      
      newUser.account.access = user.account.access;       // Maintain access level.
      
      updateUser(user, newUser); // Update!

      user.socket.emit('info', '<i>You have changed your name to <b>' + user.player.name + '</b>.</i>');
      // And alert everyone about this...
      user.socket.broadcast.emit('info', '<i>' + oldName + ' is now known as ' + 
                                                          user.player.name + '.</i>');
    });
  },
  /*  Rename into a non-registered username, changing player name, as well.
  */

  // login USERNAME PASSWORD
  'login': function (user, cmdArray) {
    // Make sure there is both a username and a password.
    if (!cmdArray[1] || !cmdArray[2]) {
      user.socket.emit('warning', '<i>Syntax: ' + cmdChar + 'login USERNAME PASSWORD</i>');
      return;
    }

    // Returns a username with first letter uppercase and the rest lowercase.
    var fixedUsername = caseName(cmdArray[1]);
    
    // Check that the username isn't already being used,
    // unless I am the one using it (register -> login.)
    if (world.users[fixedUsername] && user.account.username != fixedUsername) {
      user.socket.emit('warning', '<i>That username is already being used right now!</i>');
      return;
    }

    // Save old name to alert everyone of this change.
    var oldName = user.player.name;

    // Check if username is already registered.
    usersdb.findOne({ 'account.username': fixedUsername }, function (err, acct) {
      if (err) {
        console.log(err);
      }
      
      if (!acct) {
        user.socket.emit('warning', '<i>Username ' + fixedUsername + ' is not registered, yet.</i>');
        return;
      }

      // Wrong password check.
      if (acct.account.password != cmdArray[2]) {
        user.socket.emit('warning', '<i>Wrong password!</i>');
        return;
      }
      
      // Logout, first, if already logged-in.
      if (user.account.registered) commands.player.logout(user);
      
      // Login
      updateUser(user, acct); // Update!
      
      // Update 'lastonline'.
      user.account.lastonline = new Date();
      
      user.socket.emit('info', '<i>You are now logged into the account of ' + 
                                           user.account.username + '.</i>');
      // And alert everyone about this...
      user.socket.broadcast.emit('info', '<i>' + oldName + ' is now known as ' + 
                                                    user.player.name + '.</i>');
      
      // Load updated position.
      loadRoom(user);
    });
  },
  /*  Log into a registered user, but fail if user is already logged-in.
  */

  // register PASSWORD EMAIL
  'register': function (user, cmdArray) {
    // Check for both password and email.
    if (!cmdArray[1] || !cmdArray[2]) {
      user.socket.emit('warning', '<i>Syntax: ' + cmdChar + 'register PASSWORD EMAIL</i>');
      return;
    }
    
    // A logged-in user can't be registered, obviously.
    if (user.account.registered) {
      user.socket.emit('warning', '<i>The username ' + user.account.username +
                                                ' is already registered.</i>');
      return;
    }

    // Look for username in the DB. The rest is nested for proper order of events.
    usersdb.findOne({ 'account.username': user.account.username }, function (err, acct) {
      if (err) {
        console.log(err);
      }
      
      // Check if user is already registered.
      if (acct) {
        user.socket.emit('warning', '<i>The username ' + user.account.username +
                                                  ' is already registered.</i>');
        return;
      }

      // Register new username.
      usersdb.insert(constructor.player(user.account.username, cmdArray[1], cmdArray[2], user.player.name, 
                                        user.player.map, user.player.room), function (err) {
        if (err) {
          console.log(err);
        }
        
        // Send message.
        user.socket.emit('info', '<i>You have now registered as <b>' + 
                                  user.account.username + '</b>.</i>');
        
        // Send email.
        nodemailer.mail({
          from: "Node World <phuein@gmail.com>", // sender address
          to: cmdArray[2], // list of receivers
          subject: "Welcome to Node World, " + user.account.username + "!", // Subject line
          // text: "Hello world ✔", // plaintext body
          html: "<b>✔ Registration is complete!</b><br /><br/>Your password for username <i>" + 
                  user.account.username + "</i> is: " + cmdArray[1] // html body
        });
        
        commands.user.login(user, ['login', user.account.username, cmdArray[1]]);
      });
    });
  },
  /*  And login on success.
  */
  
  // help
  'help': function (user) {
    var commandsDisplay = '';
    
    // Show commands according to access level.
    switch (user.account.access) {
      case 'god':
        for (var access in constructor.descriptions) {
          var curAccess = constructor.descriptions[access];
          
          for (var cmd in curAccess) {
            commandsDisplay += '<b>' + cmdChar + cmd + '</b><br />';
            
            var desc = curAccess[cmd];    // The value of the property is the description.
            
            commandsDisplay += desc + '<br /><br />';
          }
        }
        break;
      
      case 'builder':
        for (var access in constructor.descriptions) {
          // Skip god commands.
          if (access == 'god') {
            continue;
          }
          
          var curAccess = constructor.descriptions[access];
          
          for (var cmd in curAccess) {
            commandsDisplay += '<b>' + cmdChar + cmd + '</b><br />';
            
            var desc = curAccess[cmd];    // The value of the property is the description.
            
            commandsDisplay += desc + '<br /><br />';
          }
        }
        break;
      
      case 'master':
        for (var access in constructor.descriptions) {
          // Skip god commands.
          if (access == 'god' || access == 'builder') {
            continue;
          }
          
          var curAccess = constructor.descriptions[access];
          
          for (var cmd in curAccess) {
            commandsDisplay += '<b>' + cmdChar + cmd + '</b><br />';
            
            var desc = curAccess[cmd];    // The value of the property is the description.
            
            commandsDisplay += desc + '<br /><br />';
          }
        }
        break;
      
      case 'player':
        for (var access in constructor.descriptions) {
          // Skip god commands.
          if (access == 'god' || access == 'builder' || access == 'master') {
            continue;
          }
          
          var curAccess = constructor.descriptions[access];
          
          for (var cmd in curAccess) {
            commandsDisplay += '<b>' + cmdChar + cmd + '</b><br />';
            
            var desc = curAccess[cmd];    // The value of the property is the description.
            
            commandsDisplay += desc + '<br /><br />';
          }
        }
        break;
      
      case 'user':
        var curAccess = constructor.descriptions['user'];
        
        for (var cmd in curAccess) {
          commandsDisplay += '<b>' + cmdChar + cmd + '</b><br />';
          
          var desc = curAccess[cmd];    // The value of the property is the description.
          
          commandsDisplay += desc + '<br /><br />';
        }
        break;
    }
    
    user.socket.emit('info', '<u>Available Commands:</u><br /><br />' + commandsDisplay);
  }
  /*  Display command usage and list all available commands,
   *  by account access level.
   */
};

// Handle command requests from player, according to user.account.access level.
function handleCommands(message, user) {  
  // Ignore first character and split the message into words.
  var cmdArray = message.substring(1).split(" ", 10);
  
  // Get everything after the command word, as a string.
  var cmdStr = message.substring(1); // Remove cmdChar
  cmdStr = cmdStr.substring(cmdStr.indexOf(" ") + 1); // Remove first (command) word,
                                                      // or return the command word itself.
  
  // Execute help command, if only the command character is received.
  if (!cmdArray[0]) {
    handleCommands(cmdChar + 'help', user);
    return;
  }
  
  // Avoid buggy calls (access not set), by defaulting to 'user' access.
  if (!user.account.access) {
    user.account.access = 'user';
    console.log('ERROR: handleCommands() request with undefined user.account.access!');
  }
  
  // Make sure the command exists, according to user access level, and is not 'descriptions'.
  var cmd = commandExists(cmdArray[0], user.account.access);
  
  if (!cmd || cmdArray[0] == 'descriptions') {
    user.socket.emit('warning', '<i>Command not found!</i>');
    return;
  }
  
  cmd(user, cmdArray, cmdStr);
}

//*** EXPORTS ***//
  exports.handleCommands  =   handleCommands;
  
  exports.loadRoom        =   loadRoom;
  exports.saveWorld       =   saveWorld;
  exports.saveUser        =   saveUser;
  exports.configureWorld  =   configureWorld;
  
  exports.fullNameID      =   fullNameID;
  exports.strPos          =   strPos;
  exports.randomName      =   randomName;
// *** //