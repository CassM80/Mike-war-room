// Sprint 28.2 — bundled ESPN 2026 PPR positional-ranking snapshot.
// Source: Mike Clay's ESPN positional rankings, published/updated during the 2026 offseason.
// These are ranking references only. War Room converts them into league-specific auction baselines.
const ESPN_RANKINGS_META={
  label:"ESPN Mike Clay PPR",
  season:2026,
  scoring:"PPR",
  updated:"2026-03-24",
  sourceUrl:"https://www.espn.com/fantasy/football/story/_/id/47513496/2026-fantasy-football-rankings-ppr-mike-clay"
};
const ESPN_POSITIONAL_RANKINGS={
QB:["Josh Allen","Jayden Daniels","Drake Maye","Lamar Jackson","Jalen Hurts","Joe Burrow","Jaxson Dart","Brock Purdy","Trevor Lawrence","Bo Nix","Caleb Williams","Dak Prescott","Matthew Stafford","Patrick Mahomes","Daniel Jones","Justin Herbert","Kyler Murray","Tyler Shough","Baker Mayfield","Jared Goff","Malik Willis","Jordan Love","Cameron Ward","C.J. Stroud","Sam Darnold","Bryce Young","Deshaun Watson","Geno Smith","Jacoby Brissett","Tua Tagovailoa","Aaron Rodgers","J.J. McCarthy"],
RB:["Bijan Robinson","Jahmyr Gibbs","Christian McCaffrey","Jonathan Taylor","De'Von Achane","James Cook","Ashton Jeanty","Saquon Barkley","Josh Jacobs","Derrick Henry","Omarion Hampton","Chase Brown","Kenneth Walker III","Breece Hall","Javonte Williams","Kyren Williams","Bucky Irving","Cam Skattebo","Quinshon Judkins","Travis Etienne Jr.","Chuba Hubbard","TreVeyon Henderson","D'Andre Swift","Bhayshul Tuten","Tony Pollard","J.K. Dobbins","David Montgomery","Aaron Jones","James Conner","Rhamondre Stevenson","RJ Harvey","Jaylen Warren","Rico Dowdle","Kenneth Gainwell","Kyle Monangai","Zach Charbonnet","Rachaad White","Woody Marks","Alvin Kamara","Blake Corum","George Holani","Tyjae Spears","Tyler Allgeier","Jonathon Brooks","Isiah Pacheco","Chris Rodriguez Jr.","Jacory Croskey-Merritt","Jordan Mason","Justice Hill","Samaje Perine"],
WR:["Puka Nacua","Ja'Marr Chase","Jaxon Smith-Njigba","Amon-Ra St. Brown","CeeDee Lamb","Drake London","Rashee Rice","Justin Jefferson","Malik Nabers","Nico Collins","Chris Olave","Garrett Wilson","A.J. Brown","George Pickens","Tetairoa McMillan","Zay Flowers","Davante Adams","DeVonta Smith","Terry McLaurin","Jaylen Waddle","Tee Higgins","DK Metcalf","Ladd McConkey","Michael Pittman Jr.","Courtland Sutton","Jameson Williams","Mike Evans","Marvin Harrison Jr.","Rome Odunze","Emeka Egbuka","Luther Burden III","DJ Moore","Alec Pierce","Chris Godwin","Jakobi Meyers","Christian Watson","Calvin Ridley","Ricky Pearsall","Parker Washington","Romeo Doubs","Wan'Dale Robinson","Jordan Addison","Michael Wilson","Brian Thomas Jr.","Khalil Shakir","Jerry Jeudy","Quentin Johnston","Matthew Golden","Josh Downs","Travis Hunter","Xavier Worthy","Tank Dell","Jalen Coker","Jayden Reed","Jalen McMillan","Jauan Jennings","Tyreek Hill","Deebo Samuel Sr.","Brandon Aiyuk","Stefon Diggs","Rashid Shaheed","Jayden Higgins","Kayshon Boutte","Tre Tucker","Adonai Mitchell","Devaughn Vele","Chimere Dike","Tre Harris","Darnell Mooney","Malik Washington"],
TE:["Trey McBride","Brock Bowers","Tyler Warren","Colston Loveland","Kyle Pitts","Harold Fannin Jr.","Sam LaPorta","Dallas Goedert","Travis Kelce","T.J. Hockenson","Mark Andrews","Jake Ferguson","Tucker Kraft","George Kittle","Isaiah Likely","Oronde Gadsden II","Hunter Henry","Juwan Johnson","Brenton Strange","Pat Freiermuth","Dalton Kincaid","Mason Taylor","Dalton Schultz","Gunnar Helm","Chigoziem Okonkwo","AJ Barner","Jake Tonges","Terrance Ferguson","Evan Engram","Mike Gesicki"]
};
const ESPN_AUCTION_CURVES={
  QB:[18,15,13,11,10,9,8,7,6,5,4,4,3,3,2,2,2,1,1,1,1,1,1,1],
  RB:[63,60,52,48,44,40,37,34,31,29,27,25,23,21,18,17,16,15,14,13,12,11,10,9,8,7,6,5,5,4,4,3,3,2,2,2,1,1,1,1],
  WR:[60,57,54,51,46,39,36,34,32,30,28,26,24,22,20,18,17,16,15,14,13,12,11,10,9,8,8,7,7,6,6,5,5,4,4,3,3,3,2,2,1,1],
  TE:[34,29,23,18,14,11,9,7,6,5,4,3,3,2,2,1,1,1,1,1]
};
