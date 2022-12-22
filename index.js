const HTMLParser = require('node-html-parser');
const sqlite3 = require('sqlite3').verbose();
const { Logger } = require('@wizo06/logger');

const sleep = (ms) => {
  return new Promise(resolve => {
    setTimeout(() => resolve(0), ms)
  })
}

(async () => {
  const logger = new Logger();
  
  logger.info('connecting to db...');
  const db = new sqlite3.Database('./kyhumane_adopt_cat_notifier.sqlite', (err) => {
    if (err) {
      logger.error(err.message);
      return
    }
    logger.success('db connected');
  });

  
  db.run(`CREATE TABLE IF NOT EXISTS cats (
    id      TEXT PRIMARY KEY,
    title   TEXT NOT NULL,
    sex     TEXT NOT NULL,
    breed   TEXT NOT NULL,
    age     TEXT NOT NULL,
    url     TEXT NOT NULL,
    img_src TEXT NOT NULL
  ) WITHOUT ROWID`, err => {
    if (err) {
      logger.error(err.message);
      return
    }
    logger.success(`cats table created`)
  });
      
  const res = await fetch('https://www.kyhumane.org/adopt/cats/');
  
  if (!res.ok) {
    logger.error('failed to fetch https://www.kyhumane.org/adopt/cats/')
    return
  }

  const data = await res.text();
  const root = HTMLParser.parse(data);
  const TDs = root.getElementsByTagName('td');

  for (const td of TDs) {
    const obj = {};

    // imgSRC
    const IMGs = td.getElementsByTagName('img');
    const imgSRC = IMGs[0].getAttribute('src');
    // console.log(imgSRC);  
    obj.imgSRC = imgSRC;

    const DIVs = td.getElementsByTagName('div')
    for (const div of DIVs) {
      // ID
      if (div.getAttribute('class') == 'list-animal-id') {
        obj.id = div.textContent;
        continue;
      }

      // Name, Condition, Location, Adoption Fee Waived
      if (div.getAttribute('class') == 'list-animal-name') {
        obj.title = div.textContent;

        // URL
        const a = div.getElementsByTagName('a')
        obj.url = a[0].getAttribute('href')
        continue;
      }

      // Sex, surgical sterilization
      if (div.getAttribute('class') == 'list-animal-sexSN') {
        obj.sex = div.textContent;
        continue;
      }

      // Breed
      if (div.getAttribute('class') == 'list-animal-breed') {
        obj.breed = div.textContent;
        continue;
      }

      // Age
      if (div.getAttribute('class') == 'list-animal-age') {
        obj.age = div.textContent;
        continue;
      }
    }

    // sleep 1 second to avoid getting rate limited by discord when sending to webhooks
    await sleep(1000);

    const params = [obj.id, obj.title, obj.sex, obj.breed, obj.age, obj.url, obj.imgSRC];
    logger.info(`inserting row into table: ${JSON.stringify(obj)}`);

    // insert into db
    db.run(`INSERT INTO cats(id, title, sex, breed, age, url, img_src) VALUES (?, ?, ?, ?, ?, ?, ?)`, params, async (err)=> {
      if (err) {
        logger.error(err.message);
          return
      }
      logger.success(`row inserted: ${JSON.stringify(obj)}`);

      // send notification for each new listing
      const webhookURL = require('./config.json').webhookURL;
      const data = {
        'embeds': [
          {
            'title': obj.title,
            'color': 0xEE6F25,
            'fields': [
              {
                'name': `Sex`,
                'value': obj.sex,
                'inline': true
              },
              {
                'name': `Breed`,
                'value': obj.breed,
                'inline': true
              },
              {
                'name': `Age`,
                'value': obj.age,
                'inline': true
              }
            ],
            'image': {
              'url': obj.imgSRC,
              'height': 0,
              'width': 0
            },
            'author': {
              'name': obj.id,
              'icon_url': `https://pbs.twimg.com/profile_images/305800242/PAW_hi_res__from_EPS_400x400.jpg`
            },
            'url': obj.url,
          }
        ]
      };
      const res = await fetch(webhookURL,{
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        logger.warn(`failed to send notification to webhook. response status: ${res.status} response body: ${await res.text()} sent data: ${JSON.stringify(data)}`);
        return
      }
      logger.success(`notificataion sent: ${JSON.stringify(data)}`);
    });
  }
})();

