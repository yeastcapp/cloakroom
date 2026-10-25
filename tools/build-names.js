// Builds src/names.js, the name lists Cloakroom uses as hints. Run once when the lists need refreshing:
//   node tools/build-names.js <folder holding the unpacked npm tarballs below>
// Sources (fetch each with `npm pack <name>` and unpack into the folder):
//   node-random-name@1.0.1        1990 US Census first names and surnames (public domain data), surnames ranked by frequency
//   wikidata-person-names@1.3.0   given and family names from Wikidata (CC0)
//   subtlex-word-frequencies@2.0.0 spoken-English word frequencies; only used here to mark names that are also everyday words
//   word-list@4.1.0               an English dictionary (MIT); only used here to mark names that are also dictionary words
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/build-names.js <folder>'); process.exit(1); }
const pkg = p => path.join(dir, p, 'package');
const census = require(path.join(pkg('node-random-name-1.0.1'), 'lib/names.js'));
const wiki = require(path.join(pkg('wikidata-person-names-1.3.0'), 'index.cjs'));
const freq = JSON.parse(fs.readFileSync(path.join(pkg('subtlex'), 'index.json'), 'utf8'));
const dict = new Set(fs.readFileSync(path.join(pkg('wordlist'), 'words.txt'), 'utf8').split('\n'));

const SURNAMES_FROM_CENSUS = 20000;   // the most common ones; past this the list is mostly rare spellings
const EVERYDAY_WORDS = 30000;         // how far down the frequency list a lowercase word counts as everyday
const TOP_FIRST = 400, TOP_LAST = 1000; // names so common they read as names first, even when also a word (Mark, Grace, Brown)

// Names this list would otherwise lack for Canada: francophone, Acadian, Indigenous, Chinese, South Asian,
// Vietnamese, Korean, Filipino and Arabic family names, and given names common here.
const EXTRA_LAST = `Tremblay Gagnon Roy Côté Cote Bouchard Gauthier Morin Lavoie Fortin Gagné Gagne Ouellet Ouellette Pelletier Bélanger Belanger Lévesque Levesque Bergeron Leblanc LeBlanc Paquette Girard Simard Boucher Caron Beaulieu Cloutier Dubé Dube Poirier Fournier Lapointe Leclerc Lefebvre Poulin Thibault Nadeau Martel Gilbert Hébert Hebert Dufour Mercier Lemieux Gingras Bernier Champagne Larouche Desjardins Lachance Savard Arsenault Cormier Thériault Theriault Doucet Boudreau Robichaud Landry Gallant Comeau Chiasson Arseneault Boudreault Lessard Vachon Racine Proulx Turcotte Gendron Bérubé Berube Charbonneau Desrosiers Lacroix Plante Guay Dion Rioux Blais Lemay Bourque Brassard Sinclair Cardinal Daniels Fontaine Spence Harper Flett Keeshig Manitowabi Nanibush Peltier Kakegamic Meekis Linklater McKay Monias Okemaw Ahenakew Bellegarde Starblanket Littlechild Wapass Kakakaway Courchene Beardy Mckenzie Bighetty Nepinak Ballantyne Tootoosis Wolfleg Crowchild Many Grey Eyes Yellowhorn Wesley Swampy Kematch Moose Bear Bird Wang Li Zhang Liu Chen Yang Huang Zhao Wu Zhou Xu Sun Ma Zhu Hu Guo He Lin Gao Luo Zheng Liang Xie Tang Han Feng Deng Cao Peng Zeng Xiao Tian Dong Pan Yuan Cai Jiang Yu Du Ye Cheng Wei Su Lu Ding Ren Shen Yao Lui Wong Chan Leung Cheung Lam Ng Ho Chow Tsang Kwan Fung Tse Yip Yeung Chu Lau Mak Siu Tam Lo Kwok Chiu Choy Kwong Szeto Patel Singh Sharma Kumar Gupta Shah Khan Ahmed Ali Hussain Malik Sidhu Gill Dhillon Sandhu Grewal Brar Bains Mann Johal Sohal Bhatia Chopra Kapoor Mehta Joshi Desai Iyer Nair Reddy Rao Pillai Menon Das Bose Banerjee Chatterjee Mukherjee Chaudhry Qureshi Siddiqui Sheikh Rahman Hossain Islam Chowdhury Akhtar Javed Iqbal Mirza Nguyen Tran Le Pham Hoang Huynh Phan Vu Vo Dang Bui Do Ngo Duong Ly Truong Dinh Lam Kim Lee Park Choi Jung Kang Cho Yoon Jang Lim Oh Seo Shin Kwon Hwang Ahn Song Yoo Hong Santos Reyes Cruz Bautista Garcia Mendoza Torres Villanueva Ramos Aquino Castillo Dizon Manalo Salazar Navarro Pascual Soriano Haddad Khoury Nasser Hamdan Saleh Mansour Abdullah Hassan Ibrahim Yousef Youssef Farah Aziz Rahimi Hosseini Karimi Mohammadi Ahmadi Rezaei Okafor Okeke Adeyemi Adebayo Okonkwo Mensah Asante Owusu Boateng Abebe Tesfaye Haile Mohamud Warsame Osman`;
const EXTRA_FIRST = `Luca Priya Aisha Fatima Mohammad Muhammad Yusuf Hassan Hussein Ibrahim Khalid Tariq Jamal Malik Layla Leila Noor Hana Sana Zainab Imran Rahul Anil Sunita Deepa Meera Anjali Vikram Sanjay Harpreet Gurpreet Jasdeep Simran Manpreet Rajesh Suresh Ravi Kavita Neha Pooja Ananya Aarav Arjun Ishaan Kiran Navdeep Parminder Sukhjinder Baljit Amandeep Jaspreet Ming Mei Ling Xin Yan Hui Jin Hyun Soo Min Jiho Yuki Hiro Kenji Haruto Akira Sakura Aiko Kofi Kwame Amara Chidi Ngozi Thandi Sipho Oluwaseun Chinedu Adebayo Nia Imani Aroha Tane Wiremu Kiri Mathieu Etienne Étienne Amélie Amelie Camille Chantal Geneviève Genevieve Josée Josee Mireille Sylvie Nathalie Isabelle Céline Celine Lucie Manon Guillaume Sébastien Sebastien Frédéric Frederic François Francois Jérôme Jerome Rémi Remi Benoît Benoit Maxime Gabrielle Mélanie Melanie Stéphanie Stephanie Émilie Emilie Annie Marc-André Jean-François Jean-Luc Jean-Philippe Marie-Ève Marie-Eve Anne-Marie Marie-Claude Thanh Linh Huong Phuong Minh Tuan Duc Quang Hoa Hieu Trang Ngoc Jun Wei Hao Yong Lei Jie Fang Xia Hong Yu Tao Bo Chao Qiang Ying Li Na Ji-woo Seo-yeon Min-jun Ha-eun Do-yoon Joon Sung Eun Kyung Young Jae Dae Hyejin Jihoon Raj Amit Arun Deepak Vijay Nikhil Rohan Sameer Tanvir Farhan Ayesha Mariam Maryam Omar Ahmad Bilal Hamza Zara Yasmin Samira Rania Rana Nadia Karim Sami Fadi Rami Ziad Walid Nour Dina Leyla Mehmet Emre Elif Zeynep Ayşe Ayse Deniz Kerem Arash Reza Shirin Parisa Dariush Nasrin Babak Mehdi Abdi Ayaan Hodan Faisal Sadia Rukhsana Nasir`;

const ok = w => /^[A-ZÀ-Ý][a-zà-ÿ'’]+(?:-[A-ZÀ-Ý][a-zà-ÿ'’]+)?$/.test(w) && w.length >= 2 && w.length <= 16;
const words = s => s.split(/\s+/).filter(Boolean);

// Everyday words: lowercase entries near the top of the spoken-English list. "John" is listed capitalized, so it is not one.
const everyday = new Set(freq.slice(0, EVERYDAY_WORDS).map(e => e.word).filter(w => /^[a-z]+$/.test(w)));

const first = new Set([...census.first_male, ...census.first_female, ...wiki.MALE, ...wiki.FEMALE, ...wiki.UNISEX, ...words(EXTRA_FIRST)].filter(ok));
const last = new Set([...census.last.slice(0, SURNAMES_FROM_CENSUS), ...wiki.FAMILY, ...words(EXTRA_LAST)].filter(ok));
// Ambiguous: an everyday spoken word (will, may), or a dictionary word (royal, bank) that is not among the most common names.
const topNames = new Set([...census.first_male.slice(0, TOP_FIRST), ...census.first_female.slice(0, TOP_FIRST), ...census.last.slice(0, TOP_LAST), ...words(EXTRA_FIRST), ...words(EXTRA_LAST)]);
const ambiguous = [...new Set([...first, ...last])].filter(w => everyday.has(w.toLowerCase()) || (dict.has(w.toLowerCase()) && !topNames.has(w))).sort();

const out = `/* Name hints for Cloakroom, generated by tools/build-names.js. Do not edit by hand.
   first: given names; last: family names; ambiguous: names that are also everyday words (Will, May, Brown),
   which only count as names when capitalized in the middle of a sentence.
   Sources: 1990 US Census (public domain), Wikidata (CC0), SUBTLEX-US frequencies (used only to mark ambiguous words). */
const NAME_DATA={
first:${JSON.stringify([...first].sort().join(' '))},
last:${JSON.stringify([...last].sort().join(' '))},
ambiguous:${JSON.stringify(ambiguous.join(' '))}
};
`;
fs.writeFileSync(path.join(__dirname, '../src/names.js'), out);
console.log(`first ${first.size}, last ${last.size}, ambiguous ${ambiguous.length}, ${(out.length / 1024).toFixed(0)} KB`);
