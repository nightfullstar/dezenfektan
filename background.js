let currentIndex = 0;
let activeTabId = null;
let isBlocking = false;
let completePercentage = 0;

// Listen for the installation of the extension
chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === "install") {
    // console.log("");
  }
});

// Check process status and start blocking process
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === "checkProcessStatus") {
    // Check activeTabId, if it is null or no tab exists with that id, reset blocking state
    if (activeTabId) {
      chrome.tabs.get(activeTabId, (tab) => {
        if (!tab) {
          resetBlockingState();
        }
      });
    } else {
      resetBlockingState();
    }

    sendResponse({ isBlocking, completePercentage });
  }
});

// Start blocking
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startBlocking") {
    startBlockingProcess(request.waitTime);
  }
});

function startBlockingProcess(waitTime) {
  currentIndex = 0;
  isBlocking = true;
  completePercentage = 0;
  chrome.storage.local.set({ isBlocking: true, completePercentage: 0 });
  chrome.storage.local.get(["usersList"], (result) => {
    const usersList = result.usersList || [];
    if (usersList.length > 0) {
      blockUsersSequentially(usersList, waitTime);
    } else {
      console.log("No usernames to block.");
      resetBlockingState();
    }
  });
}

function blockUsersSequentially(usersList, waitTime) {
  if (currentIndex >= usersList.length) {
    console.log("Finished blocking all users.");
    resetBlockingState();
    return;
  }

  // Calculate and set completePercentage
  completePercentage = Math.round((currentIndex / usersList.length) * 100);
  chrome.storage.local.set({ completePercentage });

  // Simulate blocking user
  console.log(
    `Blocking user: ${usersList[currentIndex]} (${completePercentage}% complete)`
  );

  const user = usersList[currentIndex];
  const userName = user.userName;
  const userId = user.userId;

  console.log("Blocking user:", userName, userId);

  const blockNextUser = () => {
    currentIndex++;
    blockUsersSequentially(usersList, waitTime);
  };

  const blockUserAndProceed = () => {
    setupBlockingListener(blockNextUser, waitTime, usersList);
    openUserProfile(userId, userName);
  };

  if (activeTabId) {
    chrome.tabs.update(
      activeTabId,
      { url: getUserUrl(userId, userName) },
      blockUserAndProceed
    );
  } else {
    chrome.tabs.create(
      { url: getUserUrl(userId, userName), active: true },
      (tab) => {
        activeTabId = tab.id;
        blockUserAndProceed();
      }
    );
  }
}

function setupBlockingListener(callback, waitTime, usersList) {
  chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
    if (tabId === activeTabId && changeInfo.status === "complete") {
      chrome.tabs.onUpdated.removeListener(listener);
      setTimeout(async () => {
        try {
          const blockSuccess = await chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            func: blockUser,
            args: [usersList[currentIndex].userName],
          });
          callback();
        } catch (error) {
          console.error(`Error during blocking process: ${error.message}`);
          callback();
        }
      }, waitTime);
    }
  });
}

function openUserProfile(userId, userName) {
  chrome.tabs.update(activeTabId, { url: getUserUrl(userId, userName) });
}

function resetBlockingState() {
  isBlocking = false;
  chrome.storage.local.set({ isBlocking: false });
  currentIndex = 0;
  completePercentage = 0;
  activeTabId = null;
}

function getUserUrl(userId, userName) {
  return userId
    ? `https://x.com/i/user/${userId}`
    : `https://x.com/${userName}`;
}

async function blockUser(username) {
  function getElementBySelector(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const intervalTime = 100;
      let timeSpent = 0;
      const interval = setInterval(() => {
        const element = document.querySelector(selector);
        if (element) {
          clearInterval(interval);
          resolve(element);
        }
        timeSpent += intervalTime;
        if (timeSpent >= timeout) {
          clearInterval(interval);
          reject(
            new Error(
              `Element with selector "${selector}" not found within ${timeout}ms`
            )
          );
        }
      }, intervalTime);
    });
  }

  try {
    console.log(`Blocking user: ${username}`);

    const followButton = await getElementBySelector(
      '[data-testid="placementTracking"]'
    );
    const buttonText = followButton.textContent.trim().toLowerCase();

    if (buttonText.includes("block") || buttonText.includes("engel")) {
      console.log(`User ${username} is already blocked. Skipping.`);
      return true;
    }

    const moreButton = await getElementBySelector(
      '[data-testid="userActions"]'
    );
    moreButton.click();
    const blockButton = await getElementBySelector('[data-testid="block"]');
    blockButton.click();
    const confirmButton = await getElementBySelector(
      '[data-testid="confirmationSheetConfirm"]'
    );
    confirmButton.click();
    console.log(`User ${username} successfully blocked`);

    return true;
  } catch (error) {
    console.error(`Error during blocking ${username}: ${error.message}`);

    return false;
  }
}
