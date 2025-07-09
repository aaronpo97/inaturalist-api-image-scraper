import {createWriteStream} from 'fs';
import path = require('path');
import {Readable} from 'stream';

import {mkdirSync, existsSync} from 'fs';
import {rmSync} from 'fs';

function generateFigureCaption({
  id,
  user,
  license,
  commonName,
}: {
  id: string;
  species: string;
  user: {login: string; id: number};
  license: string;
  imageUrl: string;
  commonName: string;
}): string {
  const licenseMap: Record<string, string> = {
    cc0: 'CC0 1.0',
    'cc-by': 'CC BY 4.0',
    'cc-by-nc': 'CC BY-NC 4.0',
    'cc-by-sa': 'CC BY-SA 4.0',
    'cc-by-nd': 'CC BY-ND 4.0',
    'cc-by-nc-nd': 'CC BY-NC-ND 4.0',
    'cc-by-nc-sa': 'CC BY-NC-SA 4.0',
  };

  const licenseKey = license.toLowerCase();
  const licenseName =
    licenseKey === 'cc0'
      ? 'CC0 1.0'
      : licenseMap[licenseKey] || license.toUpperCase();

  const licenseUrl =
    licenseKey === 'cc0'
      ? 'https://creativecommons.org/publicdomain/zero/1.0/'
      : `https://creativecommons.org/licenses/${licenseKey.replace(/^cc-/, '')}/4.0/`;

  return `
<figure>
  <figcaption>
    Figure ?.?.?: \"<a href="https://www.inaturalist.org/observations/${id}" target="_blank" rel="noopener noreferrer">${commonName}</a>\", by 
    <a href="https://www.inaturalist.org/users/${user.id}" target="_blank" rel="noopener noreferrer">
      ${user.login}
    </a>, 
    <a href="${licenseUrl}" target="_blank" rel="noopener noreferrer">
      ${licenseName}
    </a>.
  </figcaption>
</figure>
  `.trim();
}

function downloadImage(
  url: string,
  filepath: string,
  info: any,
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      // Ensure the directory exists
      const dir = path.dirname(filepath);
      if (!existsSync(dir)) {
        mkdirSync(dir, {recursive: true});
        console.log(`Created directory: ${dir}`);
      }

      const res = await fetch(url);
      if (!res.ok || !res.body) {
        return reject(
          new Error(`Failed to download ${url}: ${res.statusText}`),
        );
      }
      // Pipe the web ReadableStream to a Node.js writable stream
      const nodeStream = Readable.fromWeb(res.body);
      const fileStream = createWriteStream(filepath);
      nodeStream.pipe(fileStream);
      fileStream.on('finish', () => {
        console.log(`Saved ${filepath}`);
        resolve();
      });
      fileStream.on('error', reject);

      // create .info file
      const infoFilePath = filepath.replace('.jpg', '') + '.json';
      const infoStream = createWriteStream(infoFilePath);
      infoStream.write(JSON.stringify(info, null, 2));
      infoStream.end();

      const attribution = generateFigureCaption({
        id: info.id.toString(),
        species: info.species,
        user: info.user,
        license: info.license,
        imageUrl: info.url,
        commonName: info.common_name,
      });

      const htmlFilePath = filepath + '.html';
      const htmlStream = createWriteStream(htmlFilePath);
      htmlStream.write(attribution);
      htmlStream.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function getObservation(id: number): Promise<void> {
  const headers = new Headers();
 // const API_TOKEN = process.env.INAT_API_TOKEN;

 // headers.append('Authorization', API_TOKEN || '');

  const response = await fetch(
    `https://api.inaturalist.org/v1/observations/${id}`,
    {method: 'GET', headers: headers, redirect: 'follow'},
  );

  if (!response.ok) {
    console.error('API request failed:', response.statusText);
    return;
  }

  const data = (await response.json()) as any;
  const observation = data.results[0];

  const downloadsDir = path.join(__dirname, '..', 'downloads');
  if (existsSync(downloadsDir)) {
    rmSync(downloadsDir, {recursive: true, force: true});
    console.log(`Deleted folder: ${downloadsDir}`);
  }

  const photoUrls = observation.photos.map((photo: any) => {
    const rawUrl = photo.url as string;

    return rawUrl.replace('square', 'original');
  });

  console.log('Photo URLs:', photoUrls);

  const species =
    observation.species_guess || (observation.taxon?.name ?? 'Unknown Species');
  const licenses = observation.photos.map((p: any) => p.license_code || 'none');

  console.log(observation.taxon.preferred_common_name);
  console.log(observation.user.login, observation.user.id);
  console.log(`Observation ID: ${id}`);
  console.log(`Species: ${species}`);
  console.log(`Licenses: ${licenses.join(', ')}`);
  console.log(`Number of photos: ${photoUrls.length}`);

  // Download images
  for (const [index, url] of photoUrls.entries()) {
    const filename = path.basename(url.split('?')[0]); // remove query strings
    const filepath = path.join(
      __dirname,
      '..',
      'downloads',
      `${id}_${index}_${filename}`,
    );
    await downloadImage(url, filepath, {
      id: observation.id,
      common_name: observation.taxon.preferred_common_name,
      species: species,
      user: {
        login: observation.user.login,
        id: observation.user.id,
      },
      license: licenses[index],
      url: url,
    });
  }
}

getObservation(250420394);
