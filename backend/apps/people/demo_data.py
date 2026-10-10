"""Names and wording for demo records (Phase 1 spec §9). Every person made from these is_demo."""

GIRLS = tuple(
    "Ama Akua Abena Afua Yaa Efua Akosua Adwoa Esi Araba Adjoa Naa Dede Ayeley Elikplim Dzifa "
    "Enyonam Selasi Grace Mercy Priscilla Comfort Gifty Abigail Esther Ruth Belinda Eunice "
    "Fatima Zainab Mariam Rahinatu".split()
)
BOYS = tuple(
    "Kofi Kwame Kwabena Kwaku Yaw Kwasi Kojo Ekow Fiifi Kweku Nii Kpakpo Elikem Selorm Delali "
    "Senyo Emmanuel Daniel Samuel Isaac Prince Michael Joseph Richard Eric Felix Bernard "
    "Ebenezer Godfred Abdul Ibrahim Yakubu".split()
)
SURNAMES = tuple(
    "Mensah Boateng Owusu Asante Osei Agyeman Appiah Acheampong Amoah Adjei Ofori Darko "
    "Frimpong Antwi Sarpong Bonsu Opoku Gyamfi Asamoah Yeboah Danso Quaye Lamptey Tetteh Addo "
    "Annan Quartey Ansah Amponsah Baah Kyei Ampofo Agyei Dogbe Agbeko Kpodo Mahama Abubakar "
    "Issah Alhassan Seidu Fosu Nyarko Badu Afriyie".split()
)
LANDMARKS = (
    "the Methodist church",
    "the market",
    "the clinic",
    "the lorry station",
    "the mosque",
    "the community centre",
    "the police station",
    "the filling station",
)
PICKUP_POINTS = (
    "Main road junction",
    "Lorry station",
    "Market square",
    "Church car park",
    "Filling station",
)
RELATIVES = (("Aunt", "F"), ("Uncle", "M"), ("Grandmother", "F"), ("Grandfather", "M"))
PICKUP_RELATIONSHIPS = (("Aunt", "F"), ("Uncle", "M"), ("Driver", "M"), ("Grandmother", "F"))
MOBILE_PREFIXES = ("20", "23", "24", "26", "27", "28", "50", "53", "54", "55", "57", "59")
PUPIL_CONSENTS = (("PHOTO_USE", 0.8), ("MEDICAL_SHARING", 0.9), ("SCHOOL_TRIPS", 0.75))
PARENT_CONSENTS = (("SMS_CONTACT", 0.85),)
SECOND_STREAMS = ("basic_1", "kg_1", "basic_4", "nursery_1", "basic_7")

# (name, code, bands, is_learning_area): subjects of Ghana's standards-based curriculum.
SUBJECTS = (
    ("Language and Literacy", "LL", ["nursery", "kg"], True),
    ("Numeracy", "NUM", ["nursery", "kg"], True),
    ("Our World Our People", "OWOP", ["nursery", "kg", "lower_primary", "upper_primary"], False),
    ("Creative Arts", "CA", ["nursery", "kg", "lower_primary", "upper_primary"], False),
    ("English Language", "ENG", ["lower_primary", "upper_primary", "jhs"], False),
    ("Ghanaian Language", "GHL", ["lower_primary", "upper_primary", "jhs"], False),
    ("Mathematics", "MATH", ["lower_primary", "upper_primary", "jhs"], False),
    ("Science", "SCI", ["lower_primary", "upper_primary", "jhs"], False),
    ("Religious and Moral Education", "RME", ["lower_primary", "upper_primary", "jhs"], False),
    ("Physical Education", "PE", ["lower_primary", "upper_primary", "jhs"], False),
    ("Computing", "COMP", ["upper_primary", "jhs"], False),
    ("History", "HIST", ["upper_primary"], False),
    ("Social Studies", "SOC", ["jhs"], False),
    ("Career Technology", "CT", ["jhs"], False),
    ("Creative Arts and Design", "CAD", ["jhs"], False),
)

# One of each, whatever the school teaches: (role, qualification).
SUPPORT_ROLES = (
    ("Administrator", "BSc Administration"),
    ("Proprietor", "MBA"),
    ("Head Teacher", "M.Ed. Educational Leadership"),
    ("Accountant", "HND Accountancy"),
    ("Front Desk Officer", "Diploma in Secretaryship"),
    ("School Nurse", "Diploma in Nursing"),
    ("Bookshop Keeper", "WASSCE"),
    ("Canteen Officer", "Certificate in Catering"),
    ("Transport Officer", "Certificate in Fleet Management"),
)
TEACHER_QUALIFICATIONS = (
    "Diploma in Basic Education",
    "B.Ed. Basic Education",
    "B.Ed. Mathematics",
    "B.Ed. Science",
)
CAREGIVER_QUALIFICATION = "Certificate in Early Childhood Care"
