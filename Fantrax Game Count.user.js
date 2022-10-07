// ==UserScript==
// @name         Fantrax Game Count
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Add a total games count to the team roster list
// @author       Micah Hesketh
// @match        https://www.fantrax.com/fantasy/league/*/team/roster*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=fantrax.com
// @run-at       document-idle
// @grant        none
// ==/UserScript==


function CountGames()
{
    var allPlayers = document.querySelectorAll('aside._ut__aside td');
    var allStats = document.querySelectorAll('div._ut__content tr');

    var i = 0;
    for(let i=0; i < allStats.length; i++)
    {
        var scorer = allPlayers[i].querySelector('scorer');
        if(scorer)
        {
            var games = GetNumGamesFromRow(allStats[i]);
            var countHTML = "<div class=\"MHGameCount\" style=\"text-align: right;flex: auto;font-weight: bold;\">(" + games + ")</div>";
            var countElement = allPlayers[i].querySelector('div.MHGameCount');
            if(countElement)
            {
                countElement.outerHTML = countHTML;
            } else {
                scorer.insertAdjacentHTML("afterend", countHTML);
            }
        }
    }
    console.log('Recalcing CountGames()');
}

function GetNumGamesFromRow(row)
{
    var count = 0;
    var cells = row.querySelectorAll('table-cell');
    [].forEach.call(cells, function(cell) {
        if(cell.innerText.length > 5) {
            count++;
        }
    });
    return count;
}

function pageLoadCheck(changes, observer) {
    console.log('pageLoadCheck()');
    var appElement = document.querySelector('app-league-team-roster div.hide--when-lineup-change');
    if(appElement) {
        console.log('app element found...');
        observer.disconnect();
        CountGames();
        (new MutationObserver(periodChangeCheck)).observe(appElement, {childList: true, subtree: true});
    }
}

function periodChangeCheck(changes, observer) {
    console.log('periodChangeCheck()');
    CountGames();
}

(function() {
    'use strict';
    console.log('Entering Fantrax Game Count user script...');
    (new MutationObserver(pageLoadCheck)).observe(document, {childList: true, subtree: true});
})();
